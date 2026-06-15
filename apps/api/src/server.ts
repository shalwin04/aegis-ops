import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { config } from "./config.js";
import { incidentRouter } from "./routes/incidents.js";
import { webhookRouter } from "./routes/webhooks.js";
import { eventsRouter, getConnectionStats } from "./routes/events.js";
import authRouter from "./routes/auth.js";
import splunkConnectRouter from "./routes/splunk-connect.js";
import testDataRouter from "./routes/test-data.js";
import { githubRouter } from "./routes/github.js";
import { integrationsRouter } from "./routes/integrations.js";
import { chatRouter } from "./routes/chat.js";
import { anomalyRouter } from "./routes/anomaly.js";

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: config.server.corsOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: "1mb" }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "development" ? 1000 : 10, // More lenient in dev
  message: { error: "Too many authentication attempts" },
});

// Apply rate limiting
app.use("/api", apiLimiter);
app.use("/auth", authLimiter);

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    mode: config.splunk.mode,
    version: "1.0.0",
    connections: getConnectionStats(),
  });
});

// Auth routes (public)
app.use("/auth", authRouter);

// API routes
app.use("/api/incidents", incidentRouter);
app.use("/api/events", eventsRouter);
app.use("/api/github", githubRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/anomaly", anomalyRouter);
app.use("/splunk", splunkConnectRouter);

// Webhook routes (for Splunk alerts and PagerDuty)
app.use("/webhook", webhookRouter);

// Test data routes (for demos)
app.use("/test-data", testDataRouter);

// Start server
server.listen(config.server.port, () => {
  console.log(`
    ___              _       ____
   /   | ___  ____ _(_)___  / __ \\____  _____
  / /| |/ _ \\/ __ \`/ / __ \\/ / / / __ \\/ ___/
 / ___ /  __/ /_/ / (__  ) /_/ / /_/ (__  )
/_/  |_\\___/\\__, /_/____/\\____/ .___/____/
           /____/            /_/

  Autonomous Enterprise Reliability & Security Nexus

  Server:  http://localhost:${config.server.port}
  Splunk:  ${config.splunk.mode} mode

  Authentication:
    POST /auth/signup                Create account
    POST /auth/login                 Login
    GET  /auth/me                    Get current user

  Splunk Connection:
    POST /splunk/connect             Connect Splunk instance
    GET  /splunk/status              Check connection status
    POST /splunk/test                Test connection
    DELETE /splunk/disconnect        Disconnect

  GitHub Integration:
    POST /api/github/connect         Connect GitHub (PAT)
    GET  /api/github/status          Check connection status
    GET  /api/github/repos           List repositories
    POST /api/github/mappings        Create service-repo mapping
    GET  /api/github/mappings        List mappings
    POST /api/github/preview-diff    Preview code fix diff
    POST /api/github/create-pr       Create PR with fix

  Integrations (Slack, etc.):
    GET  /api/integrations           List all integrations
    POST /api/integrations/slack     Configure Slack webhook
    GET  /api/integrations/slack/status  Check Slack status
    POST /api/integrations/slack/test    Send test message
    GET  /api/integrations/dependencies  List service dependencies
    POST /api/integrations/dependencies  Add service dependency

  Agentic Chatbot:
    POST /api/chat                   Send message to AI assistant
    POST /api/chat/stream            Send message with SSE streaming
    GET  /api/chat/history           Get conversation history
    DELETE /api/chat/history         Clear conversation
    GET  /api/chat/suggestions       Get suggested prompts

  Anomaly Detection (Auto-Monitoring):
    GET  /api/anomaly/status         Check if monitoring is active
    POST /api/anomaly/start          Start auto-monitoring Splunk
    POST /api/anomaly/stop           Stop auto-monitoring

  Incidents:
    POST /api/incidents              Create incident
    GET  /api/incidents              List incidents
    GET  /api/incidents/:id          Get incident
    POST /api/incidents/:id/approve  Approve plan
    POST /api/incidents/:id/reject   Reject plan

  SSE Streams:
    GET  /api/events/stream          All events (dashboard)
    GET  /api/events/stream/:id      Incident-specific events

  Webhooks:
    POST /webhook/splunk             Splunk alerts
    POST /webhook/pagerduty          PagerDuty incidents
  `);
});

export { app, server };
