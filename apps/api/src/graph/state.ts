import { Annotation } from "@langchain/langgraph";
import type {
  AegisState,
  Severity,
  HealerFindings,
  SentinelFindings,
  CorrelationVerdict,
  ArchitectRecommendation,
  ExecutionPlan,
  AgentName,
} from "@aegis/shared";

/**
 * LangGraph state annotation for AegisOps workflow
 * This defines the shape of state that flows through the graph
 */
export const AegisStateAnnotation = Annotation.Root({
  // Incident identification
  incidentId: Annotation<string>,
  userId: Annotation<string>, // Multi-tenant: owner of this incident
  timestamp: Annotation<string>,
  severity: Annotation<Severity>,
  status: Annotation<AegisState["status"]>,

  // Input trigger
  trigger: Annotation<AegisState["trigger"]>,

  // Agent findings
  healerFindings: Annotation<HealerFindings | undefined>,
  sentinelFindings: Annotation<SentinelFindings | undefined>,

  // Correlation
  correlationVerdict: Annotation<CorrelationVerdict | undefined>,

  // Architect output
  architectRecommendation: Annotation<ArchitectRecommendation | undefined>,

  // Execution plan
  executionPlan: Annotation<ExecutionPlan | undefined>,

  // Human decision
  humanDecision: Annotation<AegisState["humanDecision"]>,

  // Execution results
  executionResults: Annotation<AegisState["executionResults"]>,

  // Memory context
  memoryContext: Annotation<AegisState["memoryContext"]>,

  // Errors (reducer to accumulate)
  errors: Annotation<AegisState["errors"]>({
    reducer: (current, update) => [...(current || []), ...(update || [])],
    default: () => [],
  }),
});

export type AegisGraphState = typeof AegisStateAnnotation.State;

// Extended state that includes userId for multi-tenant
export interface AegisStateWithUser extends AegisState {
  userId: string;
}

/**
 * Convert graph state to full AegisState for storage
 */
export function toAegisState(graphState: AegisGraphState): AegisStateWithUser {
  return {
    incidentId: graphState.incidentId,
    userId: graphState.userId,
    timestamp: graphState.timestamp,
    severity: graphState.severity,
    status: graphState.status,
    trigger: graphState.trigger,
    healerFindings: graphState.healerFindings,
    sentinelFindings: graphState.sentinelFindings,
    correlationVerdict: graphState.correlationVerdict,
    architectRecommendation: graphState.architectRecommendation,
    executionPlan: graphState.executionPlan,
    humanDecision: graphState.humanDecision,
    executionResults: graphState.executionResults,
    memoryContext: graphState.memoryContext,
    errors: graphState.errors,
  };
}
