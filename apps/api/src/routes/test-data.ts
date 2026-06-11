import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { getMCPProviderForUser } from "../mcp/index.js";
import { db } from "../db/index.js";

const router = Router();
router.use(authMiddleware);

/**
 * Sample application events for demo purposes
 */
const SAMPLE_EVENTS = {
  payment_error: {
    sourcetype: "app:payment",
    events: [
      { service: "payment-gateway", level: "ERROR", message: "Transaction timeout after 30s", latency_ms: 30250, status: 500 },
      { service: "payment-gateway", level: "ERROR", message: "Database connection pool exhausted", latency_ms: 15000, status: 503 },
      { service: "payment-gateway", level: "WARN", message: "High latency detected", latency_ms: 5200, status: 200 },
      { service: "payment-gateway", level: "ERROR", message: "Card validation failed", latency_ms: 250, status: 400 },
      { service: "checkout", level: "ERROR", message: "Upstream payment service unavailable", latency_ms: 31000, status: 502 },
    ],
  },
  auth_attack: {
    sourcetype: "app:auth",
    events: [
      { service: "user-auth", level: "WARN", message: "Failed login attempt", src_ip: "185.220.101.42", user: "admin", attempts: 150 },
      { service: "user-auth", level: "WARN", message: "Failed login attempt", src_ip: "45.155.205.89", user: "root", attempts: 89 },
      { service: "user-auth", level: "ERROR", message: "Rate limit exceeded", src_ip: "185.220.101.42", blocked: true },
      { service: "user-auth", level: "WARN", message: "Suspicious geographic pattern", src_ip: "103.75.201.44", country: "VN" },
      { service: "user-auth", level: "INFO", message: "Account locked due to failed attempts", user: "admin" },
    ],
  },
  api_latency: {
    sourcetype: "app:api",
    events: [
      { service: "inventory-api", level: "WARN", message: "Slow query detected", latency_ms: 2500, endpoint: "/products" },
      { service: "inventory-api", level: "ERROR", message: "Query timeout", latency_ms: 30000, endpoint: "/search" },
      { service: "search", level: "WARN", message: "Elasticsearch cluster yellow", latency_ms: 1800 },
      { service: "notifications", level: "INFO", message: "Queue backlog increasing", pending: 5420 },
      { service: "notifications", level: "WARN", message: "Email delivery delayed", delay_seconds: 120 },
    ],
  },
};

/**
 * POST /test-data/generate - Generate sample events in Splunk
 */
router.post("/generate", async (req: AuthRequest, res: Response) => {
  const { scenario = "payment_error", count = 5 } = req.body;

  const scenarioData = SAMPLE_EVENTS[scenario as keyof typeof SAMPLE_EVENTS];
  if (!scenarioData) {
    res.status(400).json({
      error: "Invalid scenario",
      validScenarios: Object.keys(SAMPLE_EVENTS),
    });
    return;
  }

  // Check if user has Splunk connected with HEC
  const connection = db.getSplunkConnection(req.userId!);
  if (!connection) {
    // Return mock success for demo mode
    res.json({
      success: true,
      mode: "demo",
      message: `Would generate ${count} ${scenario} events (no Splunk connected)`,
      sampleEvents: scenarioData.events.slice(0, count),
    });
    return;
  }

  // For now, just return the events that would be sent
  // HEC requires separate configuration in Splunk Cloud
  const events = scenarioData.events.slice(0, Math.min(count, scenarioData.events.length));
  const eventsWithTimestamp = events.map((e, i) => ({
    ...e,
    _time: new Date(Date.now() - i * 60000).toISOString(),
    sourcetype: scenarioData.sourcetype,
  }));

  res.json({
    success: true,
    message: `Generated ${eventsWithTimestamp.length} ${scenario} events`,
    events: eventsWithTimestamp,
    note: "To ingest these to Splunk, configure HTTP Event Collector (HEC) in your Splunk instance",
  });
});

/**
 * GET /test-data/scenarios - List available test scenarios
 */
router.get("/scenarios", (_req: AuthRequest, res: Response) => {
  const scenarios = Object.entries(SAMPLE_EVENTS).map(([key, data]) => ({
    id: key,
    sourcetype: data.sourcetype,
    eventCount: data.events.length,
    sample: data.events[0],
  }));

  res.json({ scenarios });
});

/**
 * POST /test-data/query - Test a Splunk query directly
 */
router.post("/query", async (req: AuthRequest, res: Response) => {
  const { query, earliest = "-1h", latest = "now" } = req.body;

  if (!query) {
    res.status(400).json({ error: "Query is required" });
    return;
  }

  try {
    const mcp = getMCPProviderForUser(req.userId!);
    const result = await mcp.searchSplunk(query, { earliest, latest });

    res.json({
      success: true,
      query,
      results: result.results,
      count: result.results?.length || 0,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Query failed",
    });
  }
});

export default router;
