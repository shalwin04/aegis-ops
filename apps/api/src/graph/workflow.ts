import { StateGraph, END, START } from "@langchain/langgraph";
import type { ServerEvent, AegisState, AgentDecisionLog } from "@aegis/shared";
import { AegisStateAnnotation, toAegisState, AegisStateWithUser } from "./state.js";
import { healerNode } from "../agents/healer.js";
import { sentinelNode } from "../agents/sentinel.js";
import { correlatorNode } from "../agents/correlator.js";
import { architectNode } from "../agents/architect.js";
import { incidentStore } from "../store/incidents.js";
import { executePlan } from "../execution/executor.js";
import { broadcastToIncident } from "../routes/events.js";
import { getMCPProviderForUser } from "../mcp/index.js";
import { db } from "../db/index.js";

type EventEmitter = (event: ServerEvent) => void;

// Store event emitters per incident for agent callbacks
const eventEmitters = new Map<string, EventEmitter>();

export function setEventEmitter(incidentId: string, emitter: EventEmitter) {
  eventEmitters.set(incidentId, emitter);
}

export function getEventEmitter(incidentId: string): EventEmitter | undefined {
  return eventEmitters.get(incidentId);
}

export function clearEventEmitter(incidentId: string) {
  eventEmitters.delete(incidentId);
}

/**
 * Build the AegisOps workflow graph
 *
 * Flow:
 * START -> [healer, sentinel] (parallel) -> correlator -> architect -> END
 *
 * Human-in-the-loop: After analysis, the system waits for human approval
 * before executing the plan and creating PRs.
 */
function buildWorkflowGraph() {
  const graph = new StateGraph(AegisStateAnnotation)
    // Add nodes
    .addNode("healer", healerNode)
    .addNode("sentinel", sentinelNode)
    .addNode("correlator", correlatorNode)
    .addNode("architect", architectNode)

    // Parallel fan-out from START to healer and sentinel
    .addEdge(START, "healer")
    .addEdge(START, "sentinel")

    // Fan-in: both healer and sentinel lead to correlator
    .addEdge("healer", "correlator")
    .addEdge("sentinel", "correlator")

    // Sequential: correlator -> architect -> END
    .addEdge("correlator", "architect")
    .addEdge("architect", END);

  return graph.compile();
}

// Compile the graph once
const workflow = buildWorkflowGraph();

/**
 * Run the AegisOps workflow for an incident
 *
 * AUTONOMOUS MODE: The workflow now automatically:
 * 1. Analyzes the incident (Healer + Sentinel in parallel)
 * 2. Correlates findings and determines severity
 * 3. Generates remediation plan with code fixes
 * 4. Executes ALL actions automatically
 * 5. Creates PRs for code fixes (human approval on GitHub)
 * 6. Saves to memory for future learning
 */
export async function runWorkflow(
  incidentId: string,
  userId: string,
  trigger: AegisState["trigger"],
  emitter?: EventEmitter
): Promise<AegisStateWithUser> {
  // Use SSE broadcast as the default emitter
  const emit: EventEmitter = emitter || ((event) => broadcastToIncident(incidentId, event));

  // Register the event emitter for agent callbacks
  setEventEmitter(incidentId, emit);

  // Initialize state with userId for multi-tenant
  const initialState = {
    incidentId,
    userId,
    timestamp: new Date().toISOString(),
    severity: "medium" as const,
    status: "analyzing" as const,
    trigger,
    errors: [],
  };

  // Store initial state
  incidentStore.set(incidentId, initialState as AegisStateWithUser);

  // Emit initial state
  emit({
    type: "state:update",
    incidentId,
    state: initialState as AegisStateWithUser,
    timestamp: new Date().toISOString(),
  });

  try {
    // Run the workflow (analysis phase)
    const finalState = await workflow.invoke(initialState);

    // Convert to AegisState and store
    const aegisState = toAegisState(finalState);
    incidentStore.set(incidentId, aegisState);

    // Emit plan ready event and WAIT for human approval
    if (aegisState.executionPlan) {
      aegisState.status = "awaiting_approval";
      incidentStore.set(incidentId, aegisState);

      emit({
        type: "plan:ready",
        incidentId,
        plan: aegisState.executionPlan,
        timestamp: new Date().toISOString(),
      });

      console.log(`[Workflow] Plan ready for ${incidentId} - awaiting human approval`);
      console.log(`[Workflow] Actions: ${aegisState.executionPlan.actions.map(a => a.type).join(", ")}`);

      // Do NOT auto-execute - wait for user to call approveIncident()
    } else {
      // No plan generated, mark as resolved
      aegisState.status = "resolved";
      incidentStore.set(incidentId, aegisState);

      emit({
        type: "incident:resolved",
        incidentId,
        summary: "Analysis complete. No remediation actions required.",
        timestamp: new Date().toISOString(),
      });
    }

    return aegisState;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    emit({
      type: "error",
      incidentId,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    // Update state with error
    incidentStore.update(incidentId, (s) => ({
      ...s,
      status: "rejected" as const,
      errors: [
        ...s.errors,
        {
          agent: "correlator" as const,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      ],
    }));

    throw error;
  } finally {
    clearEventEmitter(incidentId);
  }
}

/**
 * Execute plan and mark incident as complete
 */
async function executeAndComplete(
  incidentId: string,
  state: AegisStateWithUser,
  emit: EventEmitter
): Promise<void> {
  if (!state.executionPlan) return;

  const results = await executePlan(
    state.executionPlan,
    (action, status) => {
      emit({
        type: "execution:progress",
        incidentId,
        action,
        status,
        timestamp: new Date().toISOString(),
      });
    },
    state.userId
  );

  const success = results.every((r) => r.success);
  const actionsExecuted = results.filter((r) => r.success).map((r) => r.action.type);
  const errors = results.filter((r) => !r.success).map((r) => r.error || "Unknown error");

  // Check if any PRs were created
  const prResults = results.filter(
    (r) => r.action.type === "code_patch" && r.success && r.result
  );
  const prsCreated = prResults
    .map((r) => (r.result as { prUrl?: string }).prUrl)
    .filter((url): url is string => typeof url === "string");

  // Update final state
  incidentStore.update(incidentId, (s) => ({
    ...s,
    status: "resolved" as const,
    executionResults: {
      success,
      actionsExecuted,
      errors: errors.length > 0 ? errors : undefined,
      prsCreated,
      completedAt: new Date().toISOString(),
    },
  }));

  // Save agent memory to Splunk (the learning loop)
  try {
    await saveAgentMemory(state, success);
  } catch (error) {
    console.error("[Workflow] Failed to save agent memory:", error);
    // Don't fail the incident resolution if memory save fails
  }

  emit({
    type: "execution:complete",
    incidentId,
    success,
    results: {
      actionsExecuted,
      errors: errors.length > 0 ? errors : undefined,
      prsCreated,
    },
    timestamp: new Date().toISOString(),
  });

  // Create summary message
  let summary = success
    ? `Incident resolved. ${actionsExecuted.length} actions executed successfully.`
    : `Incident resolved with errors. ${actionsExecuted.length}/${results.length} actions succeeded.`;

  if (prsCreated.length > 0) {
    summary += ` ${prsCreated.length} PR(s) created - awaiting human approval on GitHub.`;
  }

  emit({
    type: "incident:resolved",
    incidentId,
    summary,
    prsCreated,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Save agent decisions to Splunk for the learning loop
 */
async function saveAgentMemory(state: AegisStateWithUser, success: boolean): Promise<void> {
  const mcp = getMCPProviderForUser(state.userId);

  // Calculate blast radius score based on severity and services affected
  const blastRadiusScore =
    state.severity === "critical"
      ? 9
      : state.severity === "high"
        ? 7
        : state.severity === "medium"
          ? 5
          : 3;

  // Create agent decision log for Splunk
  const decisionLog: AgentDecisionLog = {
    timestamp: new Date().toISOString(),
    incidentId: state.incidentId,
    agent: "architect",
    actionType: "mitigation",
    affectedServices: state.trigger.affectedServices,
    findings: {
      healerFindings: state.healerFindings,
      sentinelFindings: state.sentinelFindings,
      correlationVerdict: state.correlationVerdict,
      executionPlan: state.executionPlan,
    },
    recommendation: state.executionPlan?.summary || "",
    humanDecision: state.humanDecision?.action || "approved",
    blastRadiusScore,
  };

  // Ingest to Splunk
  await mcp.ingestEvent(decisionLog);

  // Also save to local database for quick lookups
  db.saveAgentMemory({
    userId: state.userId,
    incidentId: state.incidentId,
    agent: "architect",
    actionType: "mitigation",
    affectedServices: state.trigger.affectedServices,
    findings: decisionLog.findings,
    recommendation: decisionLog.recommendation,
    humanDecision: decisionLog.humanDecision,
    blastRadiusScore,
  });

  console.log(`[Memory] Saved decision for incident ${state.incidentId} to Splunk`);
}

/**
 * Execute plan after human approval
 */
export async function executeApprovedPlan(incidentId: string, approvedBy: string = "user"): Promise<void> {
  const state = incidentStore.get(incidentId);
  if (!state || !state.executionPlan) {
    throw new Error("No execution plan found for incident");
  }

  if (state.status === "resolved") {
    console.log(`[Workflow] Plan already resolved for ${incidentId}, ignoring`);
    return; // Already done
  }

  // Allow both "awaiting_approval" (direct call) and "executing" (called from route that already set status)
  if (state.status !== "awaiting_approval" && state.status !== "executing") {
    throw new Error(`Cannot execute plan in status: ${state.status}`);
  }

  console.log(`[Workflow] Plan approved by ${approvedBy} for ${incidentId}`);

  // Update state with approval (if not already set by route)
  if (state.status === "awaiting_approval") {
    state.status = "executing";
    state.humanDecision = {
      action: "approved",
      decidedAt: new Date().toISOString(),
      decidedBy: approvedBy,
      reason: "Human approved",
    };
    incidentStore.set(incidentId, state);
  }

  const emit: EventEmitter = (event) => broadcastToIncident(incidentId, event);

  emit({
    type: "execution:started",
    incidentId,
    planId: state.executionPlan.id,
    timestamp: new Date().toISOString(),
  });

  await executeAndComplete(incidentId, state, emit);
}
