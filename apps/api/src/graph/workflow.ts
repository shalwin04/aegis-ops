import { StateGraph, END, START } from "@langchain/langgraph";
import type { ServerEvent, AegisState, AgentDecisionLog } from "@aegis/shared";
import { AegisStateAnnotation, toAegisState, AegisStateWithUser } from "./state.js";
import { healerNode } from "../agents/healer.js";
import { sentinelNode } from "../agents/sentinel.js";
import { correlatorNode } from "../agents/correlator.js";
import { architectNode } from "../agents/architect.js";
import { incidentStore } from "../store/incidents.js";
import { executePlan, shouldAutoApprove } from "../execution/executor.js";
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
    // Run the workflow
    const finalState = await workflow.invoke(initialState);

    // Convert to AegisState and store
    const aegisState = toAegisState(finalState);
    incidentStore.set(incidentId, aegisState);

    // Emit plan ready event
    if (aegisState.executionPlan) {
      emit({
        type: "plan:ready",
        incidentId,
        plan: aegisState.executionPlan,
        timestamp: new Date().toISOString(),
      });
    }

    // Check for auto-approval (low/medium severity)
    if (shouldAutoApprove(aegisState.severity)) {
      console.log(`[Workflow] Auto-approving ${incidentId} (severity: ${aegisState.severity})`);

      // Auto-approve and execute
      aegisState.status = "executing";
      aegisState.humanDecision = {
        action: "approved",
        decidedAt: new Date().toISOString(),
        decidedBy: "auto-approval",
      };
      incidentStore.set(incidentId, aegisState);

      emit({
        type: "execution:started",
        incidentId,
        planId: aegisState.executionPlan?.id || "",
        timestamp: new Date().toISOString(),
      });

      // Execute the plan
      if (aegisState.executionPlan) {
        await executeAndComplete(incidentId, aegisState, emit);
      }
    } else {
      // Await human approval for high/critical
      aegisState.status = "awaiting_approval";
      incidentStore.set(incidentId, aegisState);

      // Emit state update
      emit({
        type: "state:update",
        incidentId,
        state: aegisState,
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

  // Update final state
  incidentStore.update(incidentId, (s) => ({
    ...s,
    status: "resolved" as const,
    executionResults: {
      success,
      actionsExecuted,
      errors: errors.length > 0 ? errors : undefined,
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
    results: { actionsExecuted, errors: errors.length > 0 ? errors : undefined },
    timestamp: new Date().toISOString(),
  });

  emit({
    type: "incident:resolved",
    incidentId,
    summary: success
      ? `Incident resolved. ${actionsExecuted.length} actions executed successfully.`
      : `Incident resolved with errors. ${actionsExecuted.length}/${results.length} actions succeeded.`,
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
 * Manually trigger execution (called after human approval)
 */
export async function executeApprovedPlan(incidentId: string): Promise<void> {
  const state = incidentStore.get(incidentId);
  if (!state || !state.executionPlan) {
    throw new Error("No execution plan found for incident");
  }

  const emit: EventEmitter = (event) => broadcastToIncident(incidentId, event);
  await executeAndComplete(incidentId, state, emit);
}
