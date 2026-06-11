/**
 * Integration Routes
 *
 * Configure Slack, PagerDuty, and other notification integrations.
 */

import { Router, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import { SlackService } from "../services/slack.js";

export const integrationsRouter = Router();
integrationsRouter.use(authMiddleware);

// ==================== SLACK ====================

const slackConfigSchema = z.object({
  webhookUrl: z.string().url().startsWith("https://hooks.slack.com/"),
  channel: z.string().optional(),
  username: z.string().optional(),
  iconEmoji: z.string().optional(),
});

/**
 * POST /api/integrations/slack
 * Configure Slack integration
 */
integrationsRouter.post("/slack", async (req: AuthRequest, res: Response) => {
  const parsed = slackConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid Slack configuration", details: parsed.error });
    return;
  }

  const userId = req.userId!;
  const config = parsed.data;

  // Test the webhook
  try {
    const slack = new SlackService(config);
    const success = await slack.testConnection();
    if (!success) {
      res.status(400).json({ error: "Failed to send test message to Slack" });
      return;
    }
  } catch (error) {
    res.status(400).json({ error: "Invalid Slack webhook URL" });
    return;
  }

  // Encrypt and store
  const { encrypted, iv, tag } = encrypt(JSON.stringify(config));

  db.saveIntegration({
    id: uuidv4(),
    userId,
    type: "slack",
    configEncrypted: encrypted,
    configIv: iv,
    configTag: tag,
    isVerified: true,
  });

  res.json({
    success: true,
    message: "Slack integration configured successfully",
  });
});

/**
 * GET /api/integrations/slack/status
 * Get Slack integration status
 */
integrationsRouter.get("/slack/status", (req: AuthRequest, res: Response) => {
  const integration = db.getIntegration(req.userId!, "slack");

  if (!integration) {
    res.json({ connected: false });
    return;
  }

  // Don't expose the webhook URL, just status
  res.json({
    connected: true,
    isVerified: integration.isVerified,
    configuredAt: integration.createdAt,
  });
});

/**
 * DELETE /api/integrations/slack
 * Remove Slack integration
 */
integrationsRouter.delete("/slack", (req: AuthRequest, res: Response) => {
  db.deleteIntegration(req.userId!, "slack");
  res.json({ success: true, message: "Slack integration removed" });
});

/**
 * POST /api/integrations/slack/test
 * Send a test message
 */
integrationsRouter.post("/slack/test", async (req: AuthRequest, res: Response) => {
  const integration = db.getIntegration(req.userId!, "slack");

  if (!integration) {
    res.status(404).json({ error: "Slack not configured" });
    return;
  }

  try {
    const configJson = decrypt(
      integration.configEncrypted,
      integration.configIv,
      integration.configTag
    );
    const config = JSON.parse(configJson);
    const slack = new SlackService(config);

    const success = await slack.send({
      text: "🧪 Test notification from AegisOps",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "🧪 *Test Notification*\nThis is a test message from AegisOps. If you see this, your Slack integration is working correctly!",
          },
        },
      ],
    });

    if (success) {
      res.json({ success: true, message: "Test message sent" });
    } else {
      res.status(500).json({ error: "Failed to send test message" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to send test message" });
  }
});

// ==================== SERVICE DEPENDENCIES ====================

const dependencySchema = z.object({
  serviceName: z.string().min(1).max(100),
  dependsOn: z.string().min(1).max(100),
  dependencyType: z.enum(["runtime", "build", "data", "async"]).default("runtime"),
  criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

/**
 * GET /api/integrations/dependencies
 * Get all service dependencies
 */
integrationsRouter.get("/dependencies", (req: AuthRequest, res: Response) => {
  const dependencies = db.getAllServiceDependencies(req.userId!);
  res.json({ dependencies });
});

/**
 * POST /api/integrations/dependencies
 * Add a service dependency
 */
integrationsRouter.post("/dependencies", (req: AuthRequest, res: Response) => {
  const parsed = dependencySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid dependency", details: parsed.error });
    return;
  }

  const { serviceName, dependsOn, dependencyType, criticality } = parsed.data;

  if (serviceName === dependsOn) {
    res.status(400).json({ error: "Service cannot depend on itself" });
    return;
  }

  db.saveServiceDependency({
    userId: req.userId!,
    serviceName,
    dependsOn,
    dependencyType,
    criticality,
  });

  res.json({ success: true, message: "Dependency added" });
});

/**
 * DELETE /api/integrations/dependencies
 * Remove a service dependency
 */
integrationsRouter.delete("/dependencies", (req: AuthRequest, res: Response) => {
  const { serviceName, dependsOn } = req.body;

  if (!serviceName || !dependsOn) {
    res.status(400).json({ error: "serviceName and dependsOn required" });
    return;
  }

  db.deleteServiceDependency(req.userId!, serviceName, dependsOn);
  res.json({ success: true, message: "Dependency removed" });
});

// ==================== ALL INTEGRATIONS ====================

/**
 * GET /api/integrations
 * Get all integration statuses
 */
integrationsRouter.get("/", (req: AuthRequest, res: Response) => {
  const integrations = db.getAllIntegrations(req.userId!);

  // Return status without exposing credentials
  const statuses = integrations.map((i) => ({
    type: i.type,
    connected: true,
    isVerified: i.isVerified,
    configuredAt: i.createdAt,
  }));

  // Add unconfigured integrations
  const configuredTypes = statuses.map((s) => s.type);
  const allTypes: Array<"slack" | "pagerduty" | "email" | "webhook"> = ["slack", "pagerduty", "email", "webhook"];

  for (const type of allTypes) {
    if (!configuredTypes.includes(type)) {
      statuses.push({
        type,
        connected: false,
        isVerified: false,
        configuredAt: "",
      });
    }
  }

  res.json({ integrations: statuses });
});
