/**
 * WebSocket event types for real-time communication
 */

import type { AgentName, AegisState, CorrelationVerdict } from "./state.js";
import type { ExecutionPlan, PlanEdits } from "./plan.js";

// ============================================
// Server → Client Events
// ============================================

export interface AgentThinkingEvent {
  type: "agent:thinking";
  incidentId: string;
  agent: AgentName;
  thought: string;
  timestamp: string;
}

export interface AgentToolCallEvent {
  type: "agent:tool_call";
  incidentId: string;
  agent: AgentName;
  tool: string;
  params: Record<string, unknown>;
  timestamp: string;
}

export interface AgentToolResultEvent {
  type: "agent:tool_result";
  incidentId: string;
  agent: AgentName;
  tool: string;
  result: unknown;
  success: boolean;
  timestamp: string;
}

export interface AgentCompleteEvent {
  type: "agent:complete";
  incidentId: string;
  agent: AgentName;
  findings: Record<string, unknown>;
  timestamp: string;
}

export interface CorrelationCompleteEvent {
  type: "correlation:complete";
  incidentId: string;
  verdict: CorrelationVerdict;
  timestamp: string;
}

export interface PlanReadyEvent {
  type: "plan:ready";
  incidentId: string;
  plan: ExecutionPlan;
  timestamp: string;
}

export interface ExecutionStartedEvent {
  type: "execution:started";
  incidentId: string;
  planId: string;
  timestamp: string;
}

export interface ExecutionProgressEvent {
  type: "execution:progress";
  incidentId: string;
  action: string;
  status: "running" | "completed" | "failed";
  timestamp: string;
}

export interface ExecutionCompleteEvent {
  type: "execution:complete";
  incidentId: string;
  success: boolean;
  results: {
    actionsExecuted: string[];
    errors?: string[];
  };
  timestamp: string;
}

export interface IncidentResolvedEvent {
  type: "incident:resolved";
  incidentId: string;
  summary: string;
  timestamp: string;
}

export interface ErrorEvent {
  type: "error";
  incidentId?: string;
  error: string;
  timestamp: string;
}

export interface StateUpdateEvent {
  type: "state:update";
  incidentId: string;
  state: AegisState;
  timestamp: string;
}

export interface AuthSuccessEvent {
  type: "auth:success";
  timestamp: string;
}

export interface AuthFailedEvent {
  type: "auth:failed";
  error: string;
  timestamp: string;
}

export type ServerEvent =
  | AgentThinkingEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentCompleteEvent
  | CorrelationCompleteEvent
  | PlanReadyEvent
  | ExecutionStartedEvent
  | ExecutionProgressEvent
  | ExecutionCompleteEvent
  | IncidentResolvedEvent
  | ErrorEvent
  | StateUpdateEvent
  | AuthSuccessEvent
  | AuthFailedEvent;

// ============================================
// Client → Server Events
// ============================================

export interface IncidentSubmitEvent {
  type: "incident:submit";
  data: {
    source: "observability" | "security" | "manual";
    description: string;
    affectedServices: string[];
    initialMetrics?: Record<string, number>;
  };
}

export interface PlanApproveEvent {
  type: "plan:approve";
  incidentId: string;
  planId: string;
}

export interface PlanRejectEvent {
  type: "plan:reject";
  incidentId: string;
  planId: string;
  reason: string;
}

export interface PlanModifyEvent {
  type: "plan:modify";
  incidentId: string;
  planId: string;
  edits: PlanEdits;
}

export interface AgentInterruptEvent {
  type: "agent:interrupt";
  incidentId: string;
}

export interface SubscribeEvent {
  type: "subscribe";
  incidentId: string;
}

export interface UnsubscribeEvent {
  type: "unsubscribe";
  incidentId: string;
}

export interface AuthEvent {
  type: "auth";
  token: string;
}

export type ClientEvent =
  | IncidentSubmitEvent
  | PlanApproveEvent
  | PlanRejectEvent
  | PlanModifyEvent
  | AgentInterruptEvent
  | SubscribeEvent
  | UnsubscribeEvent
  | AuthEvent;
