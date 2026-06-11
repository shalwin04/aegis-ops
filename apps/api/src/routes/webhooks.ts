import { Router } from "express";
import { runWorkflow } from "../graph/workflow.js";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";

// System user for webhook-triggered incidents
// In production, you'd configure this per-tenant or use HMAC to identify the user
const WEBHOOK_SYSTEM_USER_ID = "system-webhook";

// Ensure system user exists
function ensureSystemUser(): string {
  const existing = db.getUserById(WEBHOOK_SYSTEM_USER_ID);
  if (!existing) {
    try {
      db.createUser({
        id: WEBHOOK_SYSTEM_USER_ID,
        email: "system@aegisops.local",
        passwordHash: "", // Can't log in
        name: "System (Webhooks)",
      });
    } catch {
      // User might already exist from another process
    }
  }
  return WEBHOOK_SYSTEM_USER_ID;
}

export const webhookRouter = Router();

/**
 * POST /webhook/splunk
 * Receive alerts from Splunk
 *
 * Splunk Alert Webhook payload:
 * {
 *   "result": { ... },
 *   "sid": "search_id",
 *   "results_link": "...",
 *   "search_name": "Alert Name",
 *   "owner": "admin",
 *   "app": "search"
 * }
 */
webhookRouter.post("/splunk", async (req, res) => {
  try {
    const payload = req.body;

    // Extract relevant info from Splunk alert
    const searchName = payload.search_name || "Splunk Alert";
    const result = payload.result || {};

    // Try to extract service from the result or use a default
    const affectedServices = extractServicesFromSplunk(result);
    const description = buildDescriptionFromSplunk(searchName, result);

    const incidentId = `INC-${uuidv4().slice(0, 8).toUpperCase()}`;
    const userId = ensureSystemUser();

    console.log(`[Webhook:Splunk] Received alert: ${searchName} -> ${incidentId}`);

    // Create incident in database
    db.createIncident({
      id: incidentId,
      userId,
      description,
      affectedServices,
    });

    // Start workflow (events broadcast via SSE automatically)
    runWorkflow(incidentId, userId, {
      source: "observability",
      description,
      affectedServices,
      initialMetrics: extractMetricsFromSplunk(result),
    });

    res.status(200).json({
      status: "accepted",
      incidentId,
      message: "Alert received and analysis started",
    });
  } catch (error) {
    console.error("[Webhook:Splunk] Error:", error);
    res.status(500).json({ error: "Failed to process Splunk alert" });
  }
});

/**
 * POST /webhook/pagerduty
 * Receive incidents from PagerDuty
 *
 * PagerDuty Webhook V3 payload:
 * {
 *   "event": {
 *     "id": "...",
 *     "event_type": "incident.triggered",
 *     "resource_type": "incident",
 *     "occurred_at": "...",
 *     "data": {
 *       "id": "...",
 *       "type": "incident",
 *       "title": "...",
 *       "status": "triggered",
 *       "urgency": "high",
 *       "service": { "id": "...", "name": "Payment Gateway" }
 *     }
 *   }
 * }
 */
webhookRouter.post("/pagerduty", async (req, res) => {
  try {
    const payload = req.body;
    const event = payload.event || payload;

    // Only process triggered incidents
    if (event.event_type && !event.event_type.includes("triggered")) {
      return res.status(200).json({ status: "ignored", reason: "Not a trigger event" });
    }

    const data = event.data || event;
    const title = data.title || data.message?.summary || "PagerDuty Incident";
    const service = data.service?.name || "unknown-service";
    const urgency = data.urgency || "high";

    const incidentId = `INC-${uuidv4().slice(0, 8).toUpperCase()}`;
    const userId = ensureSystemUser();

    console.log(`[Webhook:PagerDuty] Received incident: ${title} -> ${incidentId}`);

    // Map PagerDuty urgency to our source type
    const source = urgency === "high" ? "security" : "observability";
    const affectedServices = [normalizeServiceName(service)];

    // Create incident in database
    db.createIncident({
      id: incidentId,
      userId,
      description: title,
      affectedServices,
    });

    // Start workflow (events broadcast via SSE automatically)
    runWorkflow(incidentId, userId, {
      source,
      description: title,
      affectedServices,
      initialMetrics: {
        pagerduty_urgency: urgency === "high" ? 1 : 0,
      },
    });

    res.status(200).json({
      status: "accepted",
      incidentId,
      message: "PagerDuty incident received and analysis started",
    });
  } catch (error) {
    console.error("[Webhook:PagerDuty] Error:", error);
    res.status(500).json({ error: "Failed to process PagerDuty incident" });
  }
});

/**
 * GET /webhook/health
 * Health check for webhook endpoints
 */
webhookRouter.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    endpoints: ["/webhook/splunk", "/webhook/pagerduty"],
  });
});

// Helper functions

function extractServicesFromSplunk(result: Record<string, unknown>): string[] {
  // Try common field names
  const serviceFields = ["service", "service_name", "app", "application", "host"];

  for (const field of serviceFields) {
    if (result[field]) {
      return [normalizeServiceName(String(result[field]))];
    }
  }

  return ["unknown-service"];
}

function buildDescriptionFromSplunk(
  searchName: string,
  result: Record<string, unknown>
): string {
  const parts = [searchName];

  if (result.message) {
    parts.push(String(result.message));
  }

  if (result._raw) {
    // Include first 200 chars of raw event
    parts.push(String(result._raw).slice(0, 200));
  }

  return parts.join(" - ");
}

function extractMetricsFromSplunk(
  result: Record<string, unknown>
): Record<string, number> {
  const metrics: Record<string, number> = {};

  // Extract numeric fields
  const numericFields = [
    "count",
    "avg",
    "sum",
    "max",
    "min",
    "latency",
    "error_rate",
    "response_time",
  ];

  for (const field of numericFields) {
    if (result[field] !== undefined) {
      const value = Number(result[field]);
      if (!isNaN(value)) {
        metrics[field] = value;
      }
    }
  }

  return metrics;
}

function normalizeServiceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
