/**
 * Deep Memory Loop Utility
 *
 * Queries past incidents and decisions to inform agent reasoning.
 * This is the "institutional memory" that makes AegisOps learn from history.
 */

import { db, AgentMemoryRecord } from "../db/index.js";
import type { HealerFindings, SentinelFindings, CorrelationVerdict } from "@aegis/shared";

export interface MemoryContext {
  /** Total number of similar past incidents found */
  totalSimilarIncidents: number;

  /** Confidence boost based on historical data (0-1) */
  confidenceBoost: number;

  /** Summary of past incident patterns */
  patternSummary: string;

  /** Specific past decisions relevant to this incident */
  relevantDecisions: PastDecision[];

  /** Historical success rate for similar incidents */
  historicalSuccessRate: number;

  /** Common remediation actions that worked */
  successfulActions: string[];

  /** Actions that were rejected by humans with reasons */
  rejectedActions: RejectedAction[];

  /** Number of rejections */
  rejectionCount: number;
}

export interface RejectedAction {
  recommendation: string;
  reason: string | null;
  incidentId: string;
}

export interface PastDecision {
  incidentId: string;
  createdAt: string;
  agent: string;
  affectedServices: string[];
  recommendation: string | null;
  humanDecision: string | null;
  blastRadiusScore: number | null;
  findingsSummary: string;
}

/**
 * Query past incidents for a list of services and build memory context
 */
export function queryMemoryForServices(
  userId: string,
  services: string[],
  limit = 15
): MemoryContext {
  const allRecords: AgentMemoryRecord[] = [];

  // Query memory for each affected service
  for (const service of services) {
    const records = db.queryAgentMemory(userId, service, Math.ceil(limit / services.length));
    allRecords.push(...records);
  }

  // Deduplicate by incident ID
  const uniqueRecords = Array.from(
    new Map(allRecords.map(r => [r.incidentId, r])).values()
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
   .slice(0, limit);

  if (uniqueRecords.length === 0) {
    return {
      totalSimilarIncidents: 0,
      confidenceBoost: 0,
      patternSummary: "No historical data available for these services.",
      relevantDecisions: [],
      historicalSuccessRate: 0,
      successfulActions: [],
      rejectedActions: [],
      rejectionCount: 0,
    };
  }

  // Analyze past decisions
  const approvedDecisions = uniqueRecords.filter(r => r.humanDecision === "approved");
  const rejectedDecisions = uniqueRecords.filter(r => r.humanDecision === "rejected");
  const successRate = approvedDecisions.length / uniqueRecords.length;

  // Calculate confidence boost (more history = higher confidence)
  const confidenceBoost = Math.min(uniqueRecords.length / 10, 0.3); // Max 30% boost

  // Extract successful and rejected actions with reasons
  const successfulActions = approvedDecisions
    .map(r => r.recommendation)
    .filter((r): r is string => r !== null)
    .slice(0, 5);

  // Extract rejected actions with reasons for learning
  const rejectedActions: RejectedAction[] = rejectedDecisions
    .filter(r => r.recommendation !== null)
    .map(r => {
      // Try to extract rejection reason from findings
      let reason: string | null = null;
      try {
        const findings = JSON.parse(r.findings);
        if (findings.executionPlan?.humanDecision?.reason) {
          reason = findings.executionPlan.humanDecision.reason;
        }
      } catch {
        // Ignore parse errors
      }
      return {
        recommendation: r.recommendation!,
        reason,
        incidentId: r.incidentId,
      };
    })
    .slice(0, 5);

  // Build pattern summary
  const patternSummary = buildPatternSummary(uniqueRecords, services);

  // Build relevant decisions
  const relevantDecisions: PastDecision[] = uniqueRecords.slice(0, 5).map(r => ({
    incidentId: r.incidentId,
    createdAt: r.createdAt,
    agent: r.agent,
    affectedServices: JSON.parse(r.affectedServices),
    recommendation: r.recommendation,
    humanDecision: r.humanDecision,
    blastRadiusScore: r.blastRadiusScore,
    findingsSummary: summarizeFindings(r.findings),
  }));

  return {
    totalSimilarIncidents: uniqueRecords.length,
    confidenceBoost,
    patternSummary,
    relevantDecisions,
    historicalSuccessRate: successRate,
    successfulActions,
    rejectedActions,
    rejectionCount: rejectedDecisions.length,
  };
}

/**
 * Build a pattern summary from historical records
 */
function buildPatternSummary(records: AgentMemoryRecord[], services: string[]): string {
  const lines: string[] = [];

  lines.push(`Found ${records.length} similar past incidents for services: ${services.join(", ")}`);

  // Count incident types by blast radius
  const criticalCount = records.filter(r => r.blastRadiusScore && r.blastRadiusScore >= 8).length;
  const highCount = records.filter(r => r.blastRadiusScore && r.blastRadiusScore >= 6 && r.blastRadiusScore < 8).length;

  if (criticalCount > 0) {
    lines.push(`- ${criticalCount} critical severity incidents in history`);
  }
  if (highCount > 0) {
    lines.push(`- ${highCount} high severity incidents in history`);
  }

  // Approval rate
  const approved = records.filter(r => r.humanDecision === "approved").length;
  const rejected = records.filter(r => r.humanDecision === "rejected").length;

  if (approved + rejected > 0) {
    const approvalRate = Math.round((approved / (approved + rejected)) * 100);
    lines.push(`- Historical approval rate: ${approvalRate}%`);
  }

  // Most recent incident
  if (records.length > 0) {
    const mostRecent = records[0];
    const daysAgo = Math.floor(
      (Date.now() - new Date(mostRecent.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    lines.push(`- Most recent similar incident: ${daysAgo} days ago`);
  }

  return lines.join("\n");
}

/**
 * Summarize findings for display
 */
function summarizeFindings(findingsJson: string): string {
  try {
    const findings = JSON.parse(findingsJson);
    const parts: string[] = [];

    // Healer findings
    if (findings.healerFindings) {
      const h = findings.healerFindings as HealerFindings;
      if (h.rootCause) parts.push(`Root cause: ${h.rootCause}`);
      if (h.errorRate) parts.push(`Error rate: ${h.errorRate}%`);
    }

    // Sentinel findings
    if (findings.sentinelFindings) {
      const s = findings.sentinelFindings as SentinelFindings;
      if (s.isMalicious) parts.push(`Attack: ${s.attackVector || "unknown"}`);
    }

    // Correlation verdict
    if (findings.correlationVerdict) {
      const c = findings.correlationVerdict as CorrelationVerdict;
      parts.push(`Type: ${c.incidentType}`);
    }

    return parts.length > 0 ? parts.join(", ") : "No summary available";
  } catch {
    return "Unable to parse findings";
  }
}

/**
 * Format memory context for LLM prompt inclusion
 */
export function formatMemoryForPrompt(memory: MemoryContext): string {
  if (memory.totalSimilarIncidents === 0) {
    return "No historical data available for these services. This appears to be a new pattern.";
  }

  const lines: string[] = [
    "=== INSTITUTIONAL MEMORY ===",
    memory.patternSummary,
    "",
  ];

  if (memory.relevantDecisions.length > 0) {
    lines.push("RECENT SIMILAR INCIDENTS:");
    for (const decision of memory.relevantDecisions) {
      lines.push(`- ${decision.incidentId} (${decision.createdAt.split("T")[0]})`);
      lines.push(`  Services: ${decision.affectedServices.join(", ")}`);
      lines.push(`  Findings: ${decision.findingsSummary}`);
      if (decision.recommendation) {
        lines.push(`  Action taken: ${decision.recommendation.substring(0, 100)}...`);
      }
      if (decision.humanDecision) {
        lines.push(`  Human decision: ${decision.humanDecision.toUpperCase()}`);
      }
      lines.push("");
    }
  }

  if (memory.successfulActions.length > 0) {
    lines.push("ACTIONS THAT WORKED BEFORE:");
    for (const action of memory.successfulActions) {
      lines.push(`✓ ${action.substring(0, 100)}...`);
    }
    lines.push("");
  }

  if (memory.rejectedActions.length > 0) {
    lines.push("⚠️ ACTIONS REJECTED BY HUMANS (AVOID THESE):");
    for (const rejection of memory.rejectedActions) {
      lines.push(`✗ ${rejection.recommendation.substring(0, 100)}...`);
      if (rejection.reason) {
        lines.push(`  Reason: "${rejection.reason}"`);
      }
      lines.push(`  (from incident ${rejection.incidentId})`);
    }
    lines.push("");
    lines.push(`IMPORTANT: ${memory.rejectionCount} past recommendations were rejected. Learn from this feedback.`);
    lines.push("");
  }

  lines.push(`Historical success rate: ${Math.round(memory.historicalSuccessRate * 100)}%`);
  lines.push(`Confidence boost from history: +${Math.round(memory.confidenceBoost * 100)}%`);
  lines.push("=== END MEMORY ===");

  return lines.join("\n");
}

/**
 * Calculate adjusted confidence based on memory
 */
export function calculateAdjustedConfidence(
  baseConfidence: number,
  memory: MemoryContext
): { adjustedConfidence: number; reasoning: string } {
  // Start with base confidence
  let adjusted = baseConfidence;
  const factors: string[] = [];

  // Boost confidence if we have similar historical data
  if (memory.totalSimilarIncidents > 0) {
    adjusted += memory.confidenceBoost;
    factors.push(`+${Math.round(memory.confidenceBoost * 100)}% from ${memory.totalSimilarIncidents} similar incidents`);
  }

  // Boost if historical success rate is high
  if (memory.historicalSuccessRate > 0.8 && memory.totalSimilarIncidents >= 3) {
    const boost = 0.1;
    adjusted += boost;
    factors.push(`+${Math.round(boost * 100)}% from ${Math.round(memory.historicalSuccessRate * 100)}% historical success`);
  }

  // Reduce confidence if many rejections
  if (memory.rejectedActions.length > 2) {
    const penalty = 0.1;
    adjusted -= penalty;
    factors.push(`-${Math.round(penalty * 100)}% due to ${memory.rejectedActions.length} past rejections`);
  }

  // Cap at 0.99
  adjusted = Math.min(Math.max(adjusted, 0), 0.99);

  const reasoning = factors.length > 0
    ? `Confidence adjusted: ${factors.join(", ")}`
    : "No historical adjustment applied";

  return { adjustedConfidence: adjusted, reasoning };
}
