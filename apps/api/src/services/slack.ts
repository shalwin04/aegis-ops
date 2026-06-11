/**
 * Slack Integration Service
 *
 * Sends real notifications to Slack channels via webhooks.
 */

import { db } from "../db/index.js";
import { decrypt } from "../utils/crypto.js";

export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

interface SlackBlock {
  type: "section" | "header" | "divider" | "context" | "actions";
  text?: { type: "mrkdwn" | "plain_text"; text: string };
  fields?: Array<{ type: "mrkdwn" | "plain_text"; text: string }>;
  elements?: Array<{ type: string; text?: { type: string; text: string }; url?: string }>;
}

interface SlackAttachment {
  color: string;
  title?: string;
  text: string;
  fields?: Array<{ title: string; value: string; short?: boolean }>;
  footer?: string;
  ts?: number;
}

export class SlackService {
  private webhookUrl: string;
  private channel?: string;
  private username: string;
  private iconEmoji: string;

  constructor(config: SlackConfig) {
    this.webhookUrl = config.webhookUrl;
    this.channel = config.channel;
    this.username = config.username || "AegisOps";
    this.iconEmoji = config.iconEmoji || ":shield:";
  }

  /**
   * Send a raw Slack message
   */
  async send(message: SlackMessage): Promise<boolean> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...message,
          channel: this.channel,
          username: this.username,
          icon_emoji: this.iconEmoji,
        }),
      });

      if (!response.ok) {
        console.error("[Slack] Failed to send message:", await response.text());
        return false;
      }

      return true;
    } catch (error) {
      console.error("[Slack] Error sending message:", error);
      return false;
    }
  }

  /**
   * Send an incident notification
   */
  async sendIncidentAlert(params: {
    incidentId: string;
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    summary: string;
    affectedServices: string[];
    dashboardUrl?: string;
  }): Promise<boolean> {
    const { incidentId, severity, title, summary, affectedServices, dashboardUrl } = params;

    const severityColors: Record<string, string> = {
      critical: "#FF0000",
      high: "#FF6B00",
      medium: "#FFC107",
      low: "#4CAF50",
    };

    const severityEmojis: Record<string, string> = {
      critical: "🚨",
      high: "⚠️",
      medium: "📢",
      low: "ℹ️",
    };

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${severityEmojis[severity]} ${title}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: summary,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Incident ID:*\n${incidentId}` },
          { type: "mrkdwn", text: `*Severity:*\n${severity.toUpperCase()}` },
          { type: "mrkdwn", text: `*Affected Services:*\n${affectedServices.join(", ")}` },
          { type: "mrkdwn", text: `*Time:*\n${new Date().toISOString()}` },
        ],
      },
    ];

    if (dashboardUrl) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View in Dashboard" },
            url: dashboardUrl,
          },
        ],
      });
    }

    return this.send({
      text: `${severityEmojis[severity]} ${title}`,
      blocks,
      attachments: [
        {
          color: severityColors[severity],
          text: "",
          footer: "AegisOps Incident Response",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Send plan approval request
   */
  async sendApprovalRequest(params: {
    incidentId: string;
    planId: string;
    title: string;
    summary: string;
    actionsCount: number;
    approvalUrl?: string;
  }): Promise<boolean> {
    const { incidentId, planId, title, summary, actionsCount, approvalUrl } = params;

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🔔 Approval Required",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${title}*\n${summary}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Incident:*\n${incidentId}` },
          { type: "mrkdwn", text: `*Plan:*\n${planId}` },
          { type: "mrkdwn", text: `*Actions:*\n${actionsCount} proposed` },
        ],
      },
    ];

    if (approvalUrl) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Review & Approve" },
            url: approvalUrl,
          },
        ],
      });
    }

    return this.send({
      text: `🔔 Approval Required: ${title}`,
      blocks,
    });
  }

  /**
   * Send execution complete notification
   */
  async sendExecutionComplete(params: {
    incidentId: string;
    success: boolean;
    actionsExecuted: string[];
    errors?: string[];
  }): Promise<boolean> {
    const { incidentId, success, actionsExecuted, errors } = params;

    const emoji = success ? "✅" : "⚠️";
    const title = success
      ? "Incident Resolved"
      : "Incident Resolved with Errors";

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} ${title}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Incident:*\n${incidentId}` },
          { type: "mrkdwn", text: `*Actions Executed:*\n${actionsExecuted.length}` },
        ],
      },
    ];

    if (actionsExecuted.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Completed:*\n• ${actionsExecuted.join("\n• ")}`,
        },
      });
    }

    if (errors && errors.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Errors:*\n• ${errors.join("\n• ")}`,
        },
      });
    }

    return this.send({
      text: `${emoji} ${title}: ${incidentId}`,
      blocks,
      attachments: [
        {
          color: success ? "#4CAF50" : "#FF6B00",
          text: "",
          footer: "AegisOps Incident Response",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
  }

  /**
   * Test the webhook connection
   */
  async testConnection(): Promise<boolean> {
    return this.send({
      text: "🔗 AegisOps Slack integration connected successfully!",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "✅ *Connection Test Successful*\nYou will receive incident notifications in this channel.",
          },
        },
      ],
    });
  }
}

/**
 * Get Slack service for a user (returns null if not configured)
 */
export function getSlackServiceForUser(userId: string): SlackService | null {
  const integration = db.getIntegration(userId, "slack");
  if (!integration) return null;

  try {
    const configJson = decrypt(
      integration.configEncrypted,
      integration.configIv,
      integration.configTag
    );
    const config: SlackConfig = JSON.parse(configJson);
    return new SlackService(config);
  } catch (error) {
    console.error("[Slack] Failed to decrypt config:", error);
    return null;
  }
}
