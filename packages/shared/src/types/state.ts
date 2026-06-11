/**
 * Core AegisOps State - flows through the LangGraph workflow
 */

export type Severity = "low" | "medium" | "high" | "critical";
export type AgentName = "healer" | "sentinel" | "architect" | "correlator";

export interface TraceData {
  traceId: string;
  spanId: string;
  service: string;
  operation: string;
  duration: number;
  status: "ok" | "error";
  tags: Record<string, string>;
}

export interface HealerFindings {
  latencySpike: boolean;
  latencyMs?: number;
  baselineLatencyMs?: number;
  errorRate: number;
  errorRateBaseline: number;
  affectedServices: string[];
  traces: TraceData[];
  rootCause?: string;
  anomalySignature?: string;
}

export interface ThreatIndicator {
  type: "ip" | "payload" | "behavior" | "geographic";
  value: string;
  confidence: number;
  source: string;
}

export interface SentinelFindings {
  isMalicious: boolean;
  confidence: number;
  attackVector?:
    | "credential-stuffing"
    | "ddos-layer7"
    | "sql-injection"
    | "xss"
    | "brute-force"
    | "data-exfiltration"
    | "unknown";
  threatIndicators: ThreatIndicator[];
  suspiciousIPs: string[];
  geoDistribution?: Record<string, number>;
  relatedIncidents?: string[];
}

export interface CorrelationVerdict {
  incidentType: "infrastructure" | "security" | "mixed" | "unknown";
  confidenceScore: number;
  summary: string;
  recommendedActions: string[];
  escalate: boolean;
}

export interface ArchitectRecommendation {
  splQuery?: string;
  edgeProcessorRule?: string;
  estimatedCostSavings?: number;
  codePatch?: {
    file: string;
    language: string;
    diff: string;
    description: string;
  };
  alertConfig?: {
    name: string;
    condition: string;
    threshold: number;
  };
}

export interface AegisState {
  // Incident identification
  incidentId: string;
  timestamp: string;
  severity: Severity;
  status: "analyzing" | "awaiting_approval" | "executing" | "resolved" | "rejected";

  // Input trigger
  trigger: {
    source: "observability" | "security" | "manual";
    description: string;
    affectedServices: string[];
    initialMetrics?: Record<string, number>;
  };

  // Agent findings (populated during parallel execution)
  healerFindings?: HealerFindings;
  sentinelFindings?: SentinelFindings;

  // Correlation result
  correlationVerdict?: CorrelationVerdict;

  // Architect output
  architectRecommendation?: ArchitectRecommendation;

  // Human-in-the-loop
  executionPlan?: import("./plan.js").ExecutionPlan;
  humanDecision?: {
    action: "approved" | "rejected" | "modified";
    reason?: string;
    modifiedPlan?: import("./plan.js").ExecutionPlan;
    decidedAt: string;
    decidedBy?: string;
  };

  // Execution results
  executionResults?: {
    success: boolean;
    actionsExecuted: string[];
    errors?: string[];
    completedAt: string;
  };

  // Memory context (from previous incidents)
  memoryContext?: {
    similarIncidents: Array<{
      incidentId: string;
      similarity: number;
      outcome: string;
    }>;
    blastRadiusHistory: number[];
  };

  // Error tracking
  errors: Array<{
    agent: AgentName;
    error: string;
    timestamp: string;
  }>;
}

export function createInitialState(
  trigger: AegisState["trigger"],
  incidentId?: string
): AegisState {
  return {
    incidentId: incidentId || `INC-${Date.now()}`,
    timestamp: new Date().toISOString(),
    severity: "medium",
    status: "analyzing",
    trigger,
    errors: [],
  };
}
