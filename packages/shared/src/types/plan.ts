/**
 * Execution Plan types - what the human approves
 */

import type {
  Severity,
  HealerFindings,
  SentinelFindings,
  CorrelationVerdict,
} from "./state.js";

// ============================================
// Action Types
// ============================================

export interface WAFRuleAction {
  type: "waf_rule";
  provider: "cloudflare" | "aws" | "generic";
  rule: {
    name: string;
    expression: string;
    action: "block" | "challenge" | "log";
    priority: number;
  };
}

export interface NetworkIsolationAction {
  type: "network_isolation";
  targets: string[];
  duration?: number; // minutes
  reason: string;
}

export interface EdgeProcessorAction {
  type: "edge_processor_rule";
  name: string;
  splScript: string;
  description: string;
  estimatedSavings?: number;
}

export interface CodePatchAction {
  type: "code_patch";
  file: string;
  language: string;
  diff: string;
  originalContent?: string;
  fixedContent?: string;
  description: string;
  rootCause?: string;
  repository?: string;
  serviceName?: string;
  createPR?: boolean;
}

export interface SplunkAlertAction {
  type: "splunk_alert";
  alertConfig: {
    name: string;
    search: string;
    cronSchedule: string;
    alertCondition: string;
    actions: string[];
  };
}

export interface RunbookTriggerAction {
  type: "runbook_trigger";
  runbookId: string;
  runbookName: string;
  parameters: Record<string, unknown>;
}

export interface NotificationAction {
  type: "notification";
  channel: "slack" | "pagerduty" | "email";
  recipients: string[];
  message: string;
  severity: Severity;
}

export type Action =
  | WAFRuleAction
  | NetworkIsolationAction
  | EdgeProcessorAction
  | CodePatchAction
  | SplunkAlertAction
  | RunbookTriggerAction
  | NotificationAction;

// ============================================
// Execution Plan
// ============================================

export interface ExecutionPlan {
  id: string;
  incidentId: string;
  generatedAt: string;
  expiresAt: string; // Plans expire if not acted upon

  // Human-readable summary
  title: string;
  summary: string;
  severity: Severity;

  // What each agent found
  diagnosis: {
    healer: HealerFindings;
    sentinel: SentinelFindings;
    correlation: CorrelationVerdict;
  };

  // Proposed actions (executed on approval)
  actions: Action[];

  // Impact assessment
  projectedImpact: {
    servicesAffected: string[];
    estimatedCostSavings?: number;
    riskLevel: "low" | "medium" | "high";
    riskExplanation: string;
    /** Blast radius prediction */
    blastRadius?: {
      totalAffected: number;
      riskScore: number;
      directlyAffected: string[];
      cascadeAffected: Array<{
        service: string;
        affectedBy: string;
        criticality: string;
      }>;
      warnings: string[];
    };
  };

  // Confidence metrics (enhanced with institutional memory)
  confidence: {
    overall: number;
    diagnosis: number;
    recommendation: number;
    /** Human-readable explanation of confidence */
    reasoning?: string;
    /** Number of similar past incidents found */
    similarIncidentCount?: number;
    /** Success rate from similar past incidents (0-1) */
    historicalSuccessRate?: number;
  };
}

export interface PlanEdits {
  // Actions to remove by index
  removeActions?: number[];

  // Actions to add
  addActions?: Action[];

  // Modify specific action
  modifyAction?: {
    index: number;
    updates: Partial<Action>;
  };

  // Override severity
  overrideSeverity?: Severity;

  // Human notes
  notes?: string;
}

export function createPlanId(): string {
  return `PLAN-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}
