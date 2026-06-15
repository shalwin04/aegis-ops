import type { Action, ExecutionPlan, Severity, CodePatchAction } from "@aegis/shared";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { decrypt } from "../utils/crypto.js";
import { GitHubService } from "../services/github.js";
import { getSlackServiceForUser } from "../services/slack.js";
import { v4 as uuidv4 } from "uuid";

// Store current incident context for notification execution
let currentIncidentContext: {
  incidentId: string;
  userId: string;
  severity: Severity;
  summary: string;
} | null = null;

export interface ExecutionResult {
  action: Action;
  success: boolean;
  result?: unknown;
  error?: string;
  executedAt: string;
}

export interface ExecutorConfig {
  cloudflare?: {
    apiToken: string;
    zoneId: string;
  };
  pagerduty?: {
    apiToken: string;
    serviceId: string;
  };
  slack?: {
    webhookUrl: string;
  };
}

/**
 * Execute all actions in a plan
 */
export async function executePlan(
  plan: ExecutionPlan,
  onProgress?: (action: string, status: "running" | "completed" | "failed") => void,
  userId?: string
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  console.log(`[Executor] Starting execution of ${plan.actions.length} actions for ${plan.incidentId}`);

  // Store incident context for notification execution
  currentIncidentContext = {
    incidentId: plan.incidentId,
    userId: userId || "",
    severity: plan.severity,
    summary: plan.summary,
  };

  for (const action of plan.actions) {
    console.log(`[Executor] Executing action: ${action.type}`);
    onProgress?.(action.type, "running");

    try {
      const result = await executeAction(action, plan.incidentId, userId);
      results.push({
        action,
        success: true,
        result,
        executedAt: new Date().toISOString(),
      });
      onProgress?.(action.type, "completed");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push({
        action,
        success: false,
        error: errorMessage,
        executedAt: new Date().toISOString(),
      });
      onProgress?.(action.type, "failed");

      // Continue with other actions even if one fails
      console.error(`[Executor] Action ${action.type} failed:`, errorMessage);
    }
  }

  // Clear context
  currentIncidentContext = null;

  return results;
}

/**
 * Execute a single action
 */
async function executeAction(action: Action, incidentId: string, userId?: string): Promise<unknown> {
  switch (action.type) {
    case "waf_rule":
      return executeWAFRule(action);
    case "network_isolation":
      return executeNetworkIsolation(action);
    case "edge_processor_rule":
      return executeEdgeProcessorRule(action);
    case "splunk_alert":
      return executeSplunkAlert(action);
    case "notification":
      return executeNotification(action);
    case "runbook_trigger":
      return executeRunbook(action);
    case "code_patch":
      return executeCodePatch(action, incidentId, userId);
    default:
      throw new Error(`Unknown action type: ${(action as any).type}`);
  }
}

/**
 * WAF Rule execution (Cloudflare example)
 */
async function executeWAFRule(action: Extract<Action, { type: "waf_rule" }>): Promise<unknown> {
  console.log(`[Executor:WAF] Creating rule: ${action.rule.name}`);

  // In production, this would call the Cloudflare API
  // For demo, we simulate the action
  if (config.features.verboseLogging) {
    console.log(`[Executor:WAF] Rule config:`, JSON.stringify(action.rule, null, 2));
  }

  // Simulate API call delay
  await delay(500);

  return {
    ruleId: `waf-${Date.now()}`,
    status: "active",
    expression: action.rule.expression,
  };
}

/**
 * Network isolation execution
 */
async function executeNetworkIsolation(
  action: Extract<Action, { type: "network_isolation" }>
): Promise<unknown> {
  console.log(`[Executor:Network] Isolating targets: ${action.targets.join(", ")}`);

  await delay(300);

  return {
    isolated: action.targets,
    duration: action.duration,
    reason: action.reason,
  };
}

/**
 * Edge Processor rule execution
 */
async function executeEdgeProcessorRule(
  action: Extract<Action, { type: "edge_processor_rule" }>
): Promise<unknown> {
  console.log(`[Executor:EdgeProcessor] Creating rule: ${action.name}`);

  await delay(400);

  return {
    ruleId: `edge-${Date.now()}`,
    name: action.name,
    status: "deployed",
  };
}

/**
 * Splunk alert creation
 */
async function executeSplunkAlert(
  action: Extract<Action, { type: "splunk_alert" }>
): Promise<unknown> {
  console.log(`[Executor:Splunk] Creating alert: ${action.alertConfig.name}`);

  await delay(300);

  return {
    alertId: `alert-${Date.now()}`,
    name: action.alertConfig.name,
    status: "enabled",
  };
}

/**
 * Notification execution (Slack, PagerDuty, Email)
 */
async function executeNotification(
  action: Extract<Action, { type: "notification" }>
): Promise<unknown> {
  console.log(`[Executor:Notification] Sending to ${action.channel}: ${action.recipients.join(", ")}`);

  // In production, this would call the appropriate API
  switch (action.channel) {
    case "slack":
      return sendSlackNotification(action);
    case "pagerduty":
      return sendPagerDutyNotification(action);
    case "email":
      return sendEmailNotification(action);
    default:
      throw new Error(`Unknown notification channel: ${action.channel}`);
  }
}

async function sendSlackNotification(
  action: Extract<Action, { type: "notification" }>
): Promise<unknown> {
  // Check if we have user context and Slack is configured
  if (currentIncidentContext?.userId) {
    const slack = getSlackServiceForUser(currentIncidentContext.userId);

    if (slack) {
      console.log(`[Executor:Slack] Sending real notification to Slack`);

      const success = await slack.sendIncidentAlert({
        incidentId: currentIncidentContext.incidentId,
        severity: currentIncidentContext.severity,
        title: action.message.replace(/^[🚨⚠️📢ℹ️]\s*/, ""), // Remove emoji prefix
        summary: currentIncidentContext.summary,
        affectedServices: action.recipients, // Using recipients as services for this context
        dashboardUrl: `http://localhost:5173/?incident=${currentIncidentContext.incidentId}`,
      });

      if (!success) {
        throw new Error("Failed to send Slack notification");
      }

      return { channel: "slack", sent: true, realNotification: true };
    }
  }

  // Fallback: simulate if Slack not configured
  console.log(`[Executor:Slack] Slack not configured, simulating notification`);
  await delay(200);
  return { channel: "slack", sent: true, simulated: true, recipients: action.recipients };
}

async function sendPagerDutyNotification(
  action: Extract<Action, { type: "notification" }>
): Promise<unknown> {
  await delay(200);
  return { channel: "pagerduty", sent: true, severity: action.severity };
}

async function sendEmailNotification(
  action: Extract<Action, { type: "notification" }>
): Promise<unknown> {
  await delay(200);
  return { channel: "email", sent: true, recipients: action.recipients };
}

/**
 * Runbook trigger execution
 */
async function executeRunbook(
  action: Extract<Action, { type: "runbook_trigger" }>
): Promise<unknown> {
  console.log(`[Executor:Runbook] Triggering: ${action.runbookName}`);

  await delay(500);

  return {
    runbookId: action.runbookId,
    executionId: `exec-${Date.now()}`,
    status: "running",
  };
}

/**
 * Code patch execution (creates PR via GitHub API)
 */
async function executeCodePatch(
  action: CodePatchAction,
  incidentId: string,
  userId?: string
): Promise<unknown> {
  console.log(`[Executor:CodePatch] Creating PR for: ${action.file}`);

  if (!action.createPR || !userId) {
    // Simulate if no PR requested or no user context
    await delay(600);
    return {
      file: action.file,
      status: "simulated",
    };
  }

  // Get GitHub connection
  const githubConnection = db.getGitHubConnection(userId);
  if (!githubConnection) {
    throw new Error("GitHub not connected");
  }

  // Get the incident description for PR body
  const incident = db.getIncident(incidentId, userId);
  if (!incident) {
    throw new Error("Incident not found");
  }

  try {
    const token = decrypt(
      githubConnection.tokenEncrypted,
      githubConnection.tokenIv,
      githubConnection.tokenTag
    );
    const github = new GitHubService(token);

    // Parse repository
    const [owner, repo] = (action.repository || "").split("/");
    if (!owner || !repo) {
      throw new Error("Invalid repository format");
    }

    // Create the PR
    const pr = await github.createCodeFixPR({
      owner,
      repo,
      incidentId,
      fix: {
        file: action.file,
        originalContent: action.originalContent || "",
        fixedContent: action.fixedContent || "",
        diff: action.diff,
        description: action.description,
      },
      incidentDescription: incident.description,
      rootCause: action.rootCause || action.description,
    });

    // Save PR record to database
    db.saveAegisPR({
      id: uuidv4(),
      incidentId,
      userId,
      repoFullName: `${owner}/${repo}`,
      prNumber: pr.number,
      prUrl: pr.html_url,
      branchName: `aegis/fix-${incidentId.toLowerCase()}`,
      title: pr.title,
      filesChanged: [action.file],
    });

    console.log(`[Executor:CodePatch] PR created: ${pr.html_url}`);

    return {
      prNumber: pr.number,
      prUrl: pr.html_url,
      status: "pr_created",
    };
  } catch (error) {
    console.error("[Executor:CodePatch] Failed to create PR:", error);
    throw error;
  }
}

/**
 * Check if severity qualifies for auto-approval
 */
export function shouldAutoApprove(severity: Severity): boolean {
  // Auto-approve low and medium severity incidents
  return severity === "low" || severity === "medium";
}

/**
 * Helper delay function
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
