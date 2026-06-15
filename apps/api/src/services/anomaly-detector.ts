/**
 * Anomaly Detector Service
 *
 * Continuously monitors Splunk for anomalies and automatically
 * triggers incident analysis when issues are detected.
 *
 * This makes AegisOps truly autonomous - no manual incident reporting needed.
 */

import { getMCPProviderForUser } from "../mcp/index.js";
import { runWorkflow } from "../graph/workflow.js";
import { broadcastToUser } from "../routes/events.js";
import { db } from "../db/index.js";
import { v4 as uuidv4 } from "uuid";

export interface AnomalyConfig {
  enabled: boolean;
  pollIntervalMs: number;
  thresholds: {
    latencySpikePct: number;      // % increase from baseline
    errorRateThreshold: number;   // % error rate to trigger
    suspiciousIPCount: number;    // Number of suspicious IPs
    failedAuthCount: number;      // Failed auth attempts in window
  };
}

interface DetectedAnomaly {
  type: "latency_spike" | "error_surge" | "security_threat" | "auth_attack";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedServices: string[];
  metrics: Record<string, number>;
  rawData?: unknown;
}

const DEFAULT_CONFIG: AnomalyConfig = {
  enabled: true,
  pollIntervalMs: 30000, // 30 seconds
  thresholds: {
    latencySpikePct: 200,    // 200% increase = 3x baseline
    errorRateThreshold: 5,    // 5% error rate
    suspiciousIPCount: 3,     // 3+ suspicious IPs
    failedAuthCount: 50,      // 50 failed logins in window
  },
};

// Track active detectors per user
const activeDetectors = new Map<string, NodeJS.Timeout>();

// Track recent incidents to avoid duplicate alerts
const recentIncidents = new Map<string, number>(); // key -> timestamp
const INCIDENT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start anomaly detection for a user
 */
export function startAnomalyDetection(
  userId: string,
  config: Partial<AnomalyConfig> = {}
): void {
  // Stop existing detector if any
  stopAnomalyDetection(userId);

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    console.log(`[AnomalyDetector] Disabled for user ${userId}`);
    return;
  }

  console.log(`[AnomalyDetector] Starting for user ${userId} (poll: ${finalConfig.pollIntervalMs}ms)`);

  // Run immediately, then on interval
  runDetectionCycle(userId, finalConfig);

  const intervalId = setInterval(
    () => runDetectionCycle(userId, finalConfig),
    finalConfig.pollIntervalMs
  );

  activeDetectors.set(userId, intervalId);
}

/**
 * Stop anomaly detection for a user
 */
export function stopAnomalyDetection(userId: string): void {
  const intervalId = activeDetectors.get(userId);
  if (intervalId) {
    clearInterval(intervalId);
    activeDetectors.delete(userId);
    console.log(`[AnomalyDetector] Stopped for user ${userId}`);
  }
}

/**
 * Run a single detection cycle
 */
async function runDetectionCycle(userId: string, config: AnomalyConfig): Promise<void> {
  console.log(`[AnomalyDetector] Running detection cycle for user ${userId}...`);

  try {
    const mcp = getMCPProviderForUser(userId);
    const anomalies: DetectedAnomaly[] = [];

    console.log(`[AnomalyDetector] Running 4 detection queries in parallel...`);

    // Run all detection queries in parallel
    const [latencyAnomaly, errorAnomaly, securityAnomaly, authAnomaly] = await Promise.all([
      detectLatencySpike(mcp, config),
      detectErrorSurge(mcp, config),
      detectSecurityThreat(mcp, config),
      detectAuthAttack(mcp, config),
    ]);

    if (latencyAnomaly) {
      console.log(`[AnomalyDetector] ⚠️ Latency anomaly detected:`, latencyAnomaly.description);
      anomalies.push(latencyAnomaly);
    }
    if (errorAnomaly) {
      console.log(`[AnomalyDetector] ⚠️ Error anomaly detected:`, errorAnomaly.description);
      anomalies.push(errorAnomaly);
    }
    if (securityAnomaly) {
      console.log(`[AnomalyDetector] ⚠️ Security anomaly detected:`, securityAnomaly.description);
      anomalies.push(securityAnomaly);
    }
    if (authAnomaly) {
      console.log(`[AnomalyDetector] ⚠️ Auth anomaly detected:`, authAnomaly.description);
      anomalies.push(authAnomaly);
    }

    console.log(`[AnomalyDetector] Detection complete. Found ${anomalies.length} anomalies.`);

    // If anomalies detected, trigger incident
    if (anomalies.length > 0) {
      await handleAnomalies(userId, anomalies);
    }
  } catch (error) {
    console.error(`[AnomalyDetector] Error for user ${userId}:`, error);
  }
}

/**
 * Detect latency spikes
 */
async function detectLatencySpike(
  mcp: ReturnType<typeof getMCPProviderForUser>,
  config: AnomalyConfig
): Promise<DetectedAnomaly | null> {
  try {
    // Simplified query - detect high latency services (>1000ms avg)
    const result = await mcp.searchSplunk(`
      index=main sourcetype="apm:trace" earliest=-15m
      | stats avg(duration_ms) as avg_latency, max(duration_ms) as max_latency, count by service
      | where avg_latency > 1000
      | sort -avg_latency
    `, { earliest: "-15m", latest: "now" });

    console.log(`[AnomalyDetector] Latency query results:`, result.results?.length || 0, "services");

    if (result.results && result.results.length > 0) {
      const topSpike = result.results[0] as {
        service: string;
        avg_latency: number;
        max_latency: number;
        count: number;
      };

      const spikePct = Math.round((topSpike.avg_latency / 200) * 100); // Assume 200ms baseline

      return {
        type: "latency_spike",
        severity: topSpike.avg_latency > 3000 ? "critical" : topSpike.avg_latency > 2000 ? "high" : "medium",
        description: `Latency spike detected: ${topSpike.service} at ${Math.round(topSpike.avg_latency)}ms avg (${spikePct}% above normal)`,
        affectedServices: result.results.map((r: any) => r.service),
        metrics: {
          currentLatency: topSpike.avg_latency,
          baselineLatency: 200,
          spikePct: spikePct,
        },
        rawData: result.results,
      };
    }
  } catch (error) {
    console.error(`[AnomalyDetector] Latency detection error:`, error);
  }
  return null;
}

/**
 * Detect error rate surge
 */
async function detectErrorSurge(
  mcp: ReturnType<typeof getMCPProviderForUser>,
  config: AnomalyConfig
): Promise<DetectedAnomaly | null> {
  try {
    const result = await mcp.searchSplunk(`
      index=main (sourcetype="apm:trace" OR sourcetype="app:log") earliest=-15m
      | eval is_error = if(status="ERROR" OR level="ERROR" OR http_status>=500, 1, 0)
      | stats count as total, sum(is_error) as errors by service
      | eval error_rate = round((errors / total) * 100, 2)
      | where errors > 0
      | sort -error_rate
    `, { earliest: "-15m", latest: "now" });

    console.log(`[AnomalyDetector] Error query results:`, result.results?.length || 0, "services with errors");

    if (result.results && result.results.length > 0) {
      const raw = result.results[0] as Record<string, unknown>;
      const topError = {
        service: String(raw.service || "unknown"),
        error_rate: parseFloat(String(raw.error_rate || 0)),
        errors: parseInt(String(raw.errors || 0), 10),
        total: parseInt(String(raw.total || 0), 10),
      };

      const threshold = config?.thresholds?.errorRateThreshold ?? 5;
      if (topError.error_rate >= threshold) {
        return {
          type: "error_surge",
          severity: topError.error_rate > 20 ? "critical" : topError.error_rate > 10 ? "high" : "medium",
          description: `Error surge detected: ${topError.service} at ${topError.error_rate}% error rate (${topError.errors}/${topError.total} requests)`,
          affectedServices: result.results.map((r: any) => String(r.service || "unknown")),
          metrics: {
            errorRate: topError.error_rate,
            errorCount: topError.errors,
            totalRequests: topError.total,
          },
          rawData: result.results,
        };
      }
    }
  } catch (error) {
    console.error(`[AnomalyDetector] Error detection error:`, error);
  }
  return null;
}

/**
 * Detect security threats (suspicious IPs, high threat scores)
 */
async function detectSecurityThreat(
  mcp: ReturnType<typeof getMCPProviderForUser>,
  config: AnomalyConfig
): Promise<DetectedAnomaly | null> {
  try {
    const result = await mcp.searchSplunk(`
      index=main (sourcetype="firewall:traffic" OR sourcetype="waf:blocked") earliest=-15m
      | where threat_score > 50 OR action="blocked"
      | stats count as block_count, dc(src_ip) as unique_ips, values(attack_signature) as signatures by src_ip
      | where block_count > 5
      | sort -block_count
      | head 10
    `, { earliest: "-15m", latest: "now" });

    console.log(`[AnomalyDetector] Security query results:`, result.results?.length || 0, "suspicious IPs");

    if (result.results && result.results.length >= 1) {
      const totalBlocks = result.results.reduce((sum: number, r: any) => sum + (parseInt(r.block_count) || 0), 0);
      const uniqueIPs = result.results.length;

      return {
        type: "security_threat",
        severity: uniqueIPs > 10 ? "critical" : uniqueIPs > 5 ? "high" : "medium",
        description: `Security threat detected: ${uniqueIPs} suspicious IPs with ${totalBlocks} blocked requests`,
        affectedServices: ["api-gateway", "firewall"],
        metrics: {
          suspiciousIPs: uniqueIPs,
          blockedRequests: totalBlocks,
        },
        rawData: result.results,
      };
    }
  } catch (error) {
    console.error(`[AnomalyDetector] Security detection error:`, error);
  }
  return null;
}

/**
 * Detect authentication attacks (brute force, credential stuffing)
 */
async function detectAuthAttack(
  mcp: ReturnType<typeof getMCPProviderForUser>,
  config: AnomalyConfig
): Promise<DetectedAnomaly | null> {
  try {
    const result = await mcp.searchSplunk(`
      index=main sourcetype="auth:login" earliest=-15m
      | where success="false" OR event_type="login_failure"
      | stats count as failures, dc(username) as unique_users by src_ip
      | where failures > 3
      | sort -failures
    `, { earliest: "-15m", latest: "now" });

    console.log(`[AnomalyDetector] Auth query results:`, result.results?.length || 0, "IPs with failed logins");

    const totalFailures = result.results?.reduce((sum: number, r: any) => sum + (parseInt(r.failures) || 0), 0) || 0;

    if (totalFailures >= 10) { // Lower threshold for demo
      const uniqueIPs = result.results?.length || 0;

      return {
        type: "auth_attack",
        severity: totalFailures > 50 ? "critical" : totalFailures > 20 ? "high" : "medium",
        description: `Authentication attack detected: ${totalFailures} failed logins from ${uniqueIPs} IPs`,
        affectedServices: ["user-auth"],
        metrics: {
          failedLogins: totalFailures,
          attackerIPs: uniqueIPs,
        },
        rawData: result.results,
      };
    }
  } catch (error) {
    console.error(`[AnomalyDetector] Auth detection error:`, error);
  }
  return null;
}

/**
 * Handle detected anomalies - create incident and trigger workflow
 */
async function handleAnomalies(userId: string, anomalies: DetectedAnomaly[]): Promise<void> {
  // Create a unique key for this anomaly combination
  const anomalyKey = anomalies
    .map(a => `${a.type}:${a.affectedServices.sort().join(",")}`)
    .sort()
    .join("|");

  // Check cooldown
  const lastIncident = recentIncidents.get(anomalyKey);
  if (lastIncident && Date.now() - lastIncident < INCIDENT_COOLDOWN_MS) {
    console.log(`[AnomalyDetector] Skipping duplicate anomaly (cooldown): ${anomalyKey}`);
    return;
  }

  // Mark as recently handled
  recentIncidents.set(anomalyKey, Date.now());

  // Determine overall severity
  const severityOrder = ["low", "medium", "high", "critical"];
  const maxSeverity = anomalies.reduce((max, a) => {
    return severityOrder.indexOf(a.severity) > severityOrder.indexOf(max) ? a.severity : max;
  }, "low" as "low" | "medium" | "high" | "critical");

  // Collect all affected services
  const allServices = [...new Set(anomalies.flatMap(a => a.affectedServices))];

  // Build incident description
  const description = `
**AUTO-DETECTED INCIDENT**

${anomalies.map(a => `- ${a.description}`).join("\n")}

**Detection Time:** ${new Date().toISOString()}
**Severity:** ${maxSeverity.toUpperCase()}
**Affected Services:** ${allServices.join(", ")}

**Metrics:**
${anomalies.map(a => Object.entries(a.metrics).map(([k, v]) => `  - ${k}: ${v}`).join("\n")).join("\n")}
`.trim();

  // Create incident ID
  const incidentId = `AUTO-${uuidv4().slice(0, 8).toUpperCase()}`;

  console.log(`[AnomalyDetector] Creating auto-incident: ${incidentId}`);
  console.log(`[AnomalyDetector] Anomalies: ${anomalies.map(a => a.type).join(", ")}`);

  // Notify user via SSE
  broadcastToUser(userId, {
    type: "anomaly:detected",
    incidentId,
    anomalies: anomalies.map(a => ({
      type: a.type,
      severity: a.severity,
      description: a.description,
    })),
    timestamp: new Date().toISOString(),
  } as any);

  // Save incident to DB
  db.createIncident({
    id: incidentId,
    userId,
    description,
    affectedServices: allServices,
    severity: maxSeverity,
  });

  // Trigger the agent workflow
  try {
    await runWorkflow(incidentId, userId, {
      source: "observability",
      description,
      affectedServices: allServices,
    });
  } catch (error) {
    console.error(`[AnomalyDetector] Workflow failed for ${incidentId}:`, error);
  }
}

/**
 * Get status of anomaly detection
 */
export function getDetectorStatus(userId: string): { active: boolean; config?: AnomalyConfig } {
  const isActive = activeDetectors.has(userId);
  return {
    active: isActive,
    config: isActive ? DEFAULT_CONFIG : undefined,
  };
}

/**
 * Clear recent incidents cache (for testing)
 */
export function clearRecentIncidents(): void {
  recentIncidents.clear();
}
