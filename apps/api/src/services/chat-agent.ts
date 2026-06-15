/**
 * Agentic Chatbot Service
 *
 * A conversational AI agent that can execute actions:
 * - Query Splunk logs and metrics
 * - Generate reports and dashboards
 * - Analyze code and create PRs
 * - Manage incidents
 * - Configure integrations
 */

import OpenAI from "openai";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { getMCPProviderForUser } from "../mcp/index.js";
import { decrypt } from "../utils/crypto.js";
import { GitHubService, generateDiff } from "./github.js";
import { getSlackServiceForUser } from "./slack.js";
import { calculateBlastRadius } from "../utils/blastRadius.js";
import { queryMemoryForServices } from "../utils/memory.js";

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

// Tool definitions for the agent (OpenAI format)
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query_splunk_logs",
      description: "Query Splunk for logs, errors, metrics. Use this when user asks about logs, errors, performance, or metrics.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language description of what to search for (e.g., 'errors in payment service last 24 hours')",
          },
          timeRange: {
            type: "string",
            description: "Time range like '-1h', '-24h', '-7d'. Default is '-1h'",
          },
          service: {
            type: "string",
            description: "Optional service name to filter by",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_report",
      description: "Generate a summary report from Splunk data. Use when user asks for reports, summaries, or analysis.",
      parameters: {
        type: "object",
        properties: {
          reportType: {
            type: "string",
            enum: ["error_summary", "latency_report", "security_audit", "service_health"],
            description: "Type of report to generate",
          },
          services: {
            type: "array",
            items: { type: "string" },
            description: "Services to include in report",
          },
          timeRange: {
            type: "string",
            description: "Time range for the report",
          },
        },
        required: ["reportType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_incidents",
      description: "List recent incidents. Use when user asks about incidents, issues, or problems.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["all", "analyzing", "awaiting_approval", "resolved", "rejected"],
            description: "Filter by status",
          },
          limit: {
            type: "number",
            description: "Number of incidents to return (default 10)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_incident_details",
      description: "Get details about a specific incident including findings and plan.",
      parameters: {
        type: "object",
        properties: {
          incidentId: {
            type: "string",
            description: "The incident ID (e.g., INC-ABC123)",
          },
        },
        required: ["incidentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_code",
      description: "Fetch and analyze code from a GitHub repository. Use when user asks about code issues or wants to see code.",
      parameters: {
        type: "object",
        properties: {
          service: {
            type: "string",
            description: "Service name that maps to a repository",
          },
          filePath: {
            type: "string",
            description: "Optional specific file path to analyze",
          },
          issueDescription: {
            type: "string",
            description: "Description of the issue to look for",
          },
        },
        required: ["service"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_code_fix",
      description: "Generate a code fix and optionally create a PR. Use when user asks to fix code or create a PR.",
      parameters: {
        type: "object",
        properties: {
          service: {
            type: "string",
            description: "Service name that maps to a repository",
          },
          filePath: {
            type: "string",
            description: "File path to fix",
          },
          issueDescription: {
            type: "string",
            description: "Description of what to fix",
          },
          createPR: {
            type: "boolean",
            description: "Whether to create a PR (default false, just show diff)",
          },
        },
        required: ["service", "filePath", "issueDescription"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_service_health",
      description: "Check the health and status of services. Use when user asks about service status or health.",
      parameters: {
        type: "object",
        properties: {
          services: {
            type: "array",
            items: { type: "string" },
            description: "Services to check (empty for all)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_blast_radius",
      description: "Calculate blast radius for services. Use when user asks about impact or dependencies.",
      parameters: {
        type: "object",
        properties: {
          services: {
            type: "array",
            items: { type: "string" },
            description: "Services to analyze",
          },
        },
        required: ["services"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_slack_notification",
      description: "Send a message to Slack. Use when user asks to notify team or send alerts.",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Message to send",
          },
          severity: {
            type: "string",
            enum: ["info", "warning", "critical"],
            description: "Severity level",
          },
        },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_past_incidents",
      description: "Query historical incidents for patterns. Use when user asks about past issues or patterns.",
      parameters: {
        type: "object",
        properties: {
          services: {
            type: "array",
            items: { type: "string" },
            description: "Services to query history for",
          },
          limit: {
            type: "number",
            description: "Number of past incidents to retrieve",
          },
        },
        required: ["services"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are AegisOps Assistant, an AI agent that helps with incident response, observability, and security operations.

You have access to tools that let you:
- Query Splunk logs and metrics
- Generate reports and analysis
- List and manage incidents
- Analyze code and create pull requests
- Check service health and blast radius
- Send Slack notifications
- Query historical incident patterns

When users ask questions:
1. Think about what tools you need to answer
2. Execute the tools to gather information
3. Synthesize the results into a clear, actionable response
4. If you can take action (like creating a PR), offer to do so

Be proactive: if you detect issues, suggest fixes. If you see patterns, highlight them.

Format your responses clearly with:
- Summaries at the top
- Details in sections
- Code in fenced blocks
- Action items highlighted

Remember: You're not just answering questions, you're helping solve problems.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolResults?: Array<{
    tool: string;
    input: unknown;
  }>;
}

export interface ChatContext {
  userId: string;
  conversationHistory: ChatMessage[];
}

/**
 * Process a chat message and execute any necessary tools
 */
export async function processChat(
  message: string,
  context: ChatContext,
  onStream?: (chunk: string) => void,
  onToolUse?: (tool: string, input: unknown) => void
): Promise<string> {
  const { userId, conversationHistory } = context;

  // Build messages from history
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
  ];

  // Add current message
  messages.push({ role: "user", content: message });

  let fullResponse = "";
  let continueLoop = true;

  while (continueLoop) {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      max_tokens: 4096,
      tools: TOOLS,
      messages,
    });

    const choice = response.choices[0];
    const responseMessage = choice?.message;

    // Process response content
    if (responseMessage?.content) {
      fullResponse += responseMessage.content;
      onStream?.(responseMessage.content);
    }

    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      // Add assistant message with tool calls
      messages.push(responseMessage);

      // Execute each tool call
      for (const toolCall of responseMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolInput = JSON.parse(toolCall.function.arguments);

        onToolUse?.(toolName, toolInput);

        // Execute the tool
        const toolResult = await executeTool(toolName, toolInput, userId);

        // Add tool result
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult, null, 2),
        });
      }
      continueLoop = true;
    } else {
      continueLoop = false;
    }
  }

  return fullResponse;
}

/**
 * Execute a tool and return results
 */
async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  console.log(`[ChatAgent] Executing tool: ${toolName}`, input);

  switch (toolName) {
    case "query_splunk_logs":
      return executeQuerySplunk(input, userId);

    case "generate_report":
      return executeGenerateReport(input, userId);

    case "list_incidents":
      return executeListIncidents(input, userId);

    case "get_incident_details":
      return executeGetIncidentDetails(input, userId);

    case "analyze_code":
      return executeAnalyzeCode(input, userId);

    case "create_code_fix":
      return executeCreateCodeFix(input, userId);

    case "check_service_health":
      return executeCheckServiceHealth(input, userId);

    case "get_blast_radius":
      return executeGetBlastRadius(input, userId);

    case "send_slack_notification":
      return executeSendSlack(input, userId);

    case "query_past_incidents":
      return executeQueryPastIncidents(input, userId);

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ==================== TOOL IMPLEMENTATIONS ====================

async function executeQuerySplunk(
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const mcp = getMCPProviderForUser(userId);
  const query = input.query as string;
  const timeRange = (input.timeRange as string) || "-1h";
  const service = input.service as string | undefined;

  // Build SPL query based on natural language
  let spl = `index=_internal earliest=${timeRange}`;

  if (query.toLowerCase().includes("error")) {
    spl += " log_level=ERROR";
  }
  if (query.toLowerCase().includes("warn")) {
    spl += " OR log_level=WARN";
  }
  if (service) {
    spl += ` component="${service}"`;
  }

  spl += " | stats count by log_level, component | head 20";

  try {
    const results = await mcp.searchSplunk(spl, { earliest: timeRange, latest: "now" });
    return {
      query: spl,
      timeRange,
      results,
      summary: `Found ${Array.isArray(results) ? results.length : 0} log groups`,
    };
  } catch (error) {
    return { error: String(error), query: spl };
  }
}

async function executeGenerateReport(
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const reportType = input.reportType as string;
  const services = (input.services as string[]) || [];
  const timeRange = (input.timeRange as string) || "-24h";
  const mcp = getMCPProviderForUser(userId);

  let spl = "";
  let reportTitle = "";

  switch (reportType) {
    case "error_summary":
      reportTitle = "Error Summary Report";
      spl = `index=_internal log_level=ERROR earliest=${timeRange}
        | stats count as error_count, dc(component) as services_affected
        | append [search index=_internal log_level=ERROR earliest=${timeRange}
          | top 5 component
          | rename count as errors]`;
      break;

    case "latency_report":
      reportTitle = "Latency Performance Report";
      spl = `index=_internal earliest=${timeRange}
        | stats avg(elapsed_ms) as avg_latency, max(elapsed_ms) as max_latency, p95(elapsed_ms) as p95_latency
        | eval status=if(avg_latency>1000, "DEGRADED", "HEALTHY")`;
      break;

    case "security_audit":
      reportTitle = "Security Audit Report";
      spl = `index=_audit earliest=${timeRange}
        | stats count by action, user
        | sort -count
        | head 20`;
      break;

    case "service_health":
      reportTitle = "Service Health Report";
      spl = `index=_internal earliest=${timeRange}
        | stats count as total, count(eval(log_level="ERROR")) as errors by component
        | eval error_rate=round(errors/total*100, 2)
        | sort -errors`;
      break;

    default:
      return { error: "Unknown report type" };
  }

  try {
    const results = await mcp.searchSplunk(spl, { earliest: timeRange, latest: "now" });
    return {
      reportType,
      reportTitle,
      timeRange,
      generatedAt: new Date().toISOString(),
      query: spl,
      data: results,
    };
  } catch (error) {
    return { error: String(error) };
  }
}

async function executeListIncidents(
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const status = input.status as string | undefined;
  const limit = (input.limit as number) || 10;

  const incidents = db.getIncidentsByUser(userId, limit);

  const filtered = status && status !== "all"
    ? incidents.filter((i) => i.status === status)
    : incidents;

  return {
    total: filtered.length,
    incidents: filtered.map((i) => ({
      id: i.id,
      status: i.status,
      severity: i.severity,
      description: i.description.substring(0, 100) + (i.description.length > 100 ? "..." : ""),
      services: JSON.parse(i.affectedServices),
      createdAt: i.createdAt,
    })),
  };
}

async function executeGetIncidentDetails(
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const incidentId = input.incidentId as string;
  const incident = db.getIncident(incidentId, userId);

  if (!incident) {
    return { error: "Incident not found" };
  }

  return {
    id: incident.id,
    status: incident.status,
    severity: incident.severity,
    description: incident.description,
    services: JSON.parse(incident.affectedServices),
    healerFindings: incident.healerFindings ? JSON.parse(incident.healerFindings) : null,
    sentinelFindings: incident.sentinelFindings ? JSON.parse(incident.sentinelFindings) : null,
    correlationVerdict: incident.correlationVerdict ? JSON.parse(incident.correlationVerdict) : null,
    executionPlan: incident.executionPlan ? JSON.parse(incident.executionPlan) : null,
    createdAt: incident.createdAt,
    resolvedAt: incident.resolvedAt,
  };
}

async function executeAnalyzeCode(
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const service = input.service as string;
  const filePath = input.filePath as string | undefined;
  const issueDescription = input.issueDescription as string | undefined;

  // Get GitHub connection
  const githubConnection = db.getGitHubConnection(userId);
  if (!githubConnection) {
    return { error: "GitHub not connected. Please connect your GitHub account first." };
  }

  // Get service mapping
  const mapping = db.getServiceRepoMapping(userId, service);
  if (!mapping) {
    return { error: `No repository mapping found for service "${service}". Please configure the mapping first.` };
  }

  try {
    const token = decrypt(
      githubConnection.tokenEncrypted,
      githubConnection.tokenIv,
      githubConnection.tokenTag
    );
    const github = new GitHubService(token);

    if (filePath) {
      // Get specific file
      const file = await github.getFileContent(mapping.repoOwner, mapping.repoName, filePath);
      return {
        repository: `${mapping.repoOwner}/${mapping.repoName}`,
        file: filePath,
        content: file.content.substring(0, 2000) + (file.content.length > 2000 ? "\n... (truncated)" : ""),
        sha: file.sha,
      };
    } else {
      // Search for files related to issue
      const searchQuery = issueDescription || service;
      const files = await github.searchFiles(mapping.repoOwner, mapping.repoName, searchQuery);
      return {
        repository: `${mapping.repoOwner}/${mapping.repoName}`,
        searchQuery,
        files: files.slice(0, 10).map((f) => f.path),
      };
    }
  } catch (error) {
    return { error: String(error) };
  }
}

async function executeCreateCodeFix(
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const service = input.service as string;
  const filePath = input.filePath as string;
  const issueDescription = input.issueDescription as string;
  const createPR = input.createPR as boolean || false;

  // Get GitHub connection
  const githubConnection = db.getGitHubConnection(userId);
  if (!githubConnection) {
    return { error: "GitHub not connected" };
  }

  const mapping = db.getServiceRepoMapping(userId, service);
  if (!mapping) {
    return { error: `No repository mapping for "${service}"` };
  }

  try {
    const token = decrypt(
      githubConnection.tokenEncrypted,
      githubConnection.tokenIv,
      githubConnection.tokenTag
    );
    const github = new GitHubService(token);

    // Get file content
    const file = await github.getFileContent(mapping.repoOwner, mapping.repoName, filePath);

    // Generate fix using OpenAI
    const fixResponse = await openai.chat.completions.create({
      model: config.openai.model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Fix this code issue:

Issue: ${issueDescription}

File: ${filePath}

\`\`\`
${file.content}
\`\`\`

Return a JSON object with:
{
  "fixedContent": "the complete fixed file content",
  "description": "one-line description of the fix",
  "rootCause": "brief explanation of the issue"
}`,
        },
      ],
    });

    const fixContent = fixResponse.choices[0]?.message?.content;
    if (!fixContent) {
      return { error: "Failed to generate fix" };
    }

    const jsonMatch = fixContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { error: "Failed to parse fix" };
    }

    const fix = JSON.parse(jsonMatch[0]);
    const diff = generateDiff(file.content, fix.fixedContent, filePath);

    if (createPR) {
      // Create actual PR
      const pr = await github.createCodeFixPR({
        owner: mapping.repoOwner,
        repo: mapping.repoName,
        incidentId: `CHAT-${Date.now()}`,
        fix: {
          file: filePath,
          originalContent: file.content,
          fixedContent: fix.fixedContent,
          diff,
          description: fix.description,
        },
        incidentDescription: issueDescription,
        rootCause: fix.rootCause,
      });

      return {
        action: "pr_created",
        prNumber: pr.number,
        prUrl: pr.html_url,
        description: fix.description,
        diff,
      };
    } else {
      return {
        action: "diff_preview",
        file: filePath,
        description: fix.description,
        rootCause: fix.rootCause,
        diff,
        hint: "Say 'create the PR' to submit this fix",
      };
    }
  } catch (error) {
    return { error: String(error) };
  }
}

async function executeCheckServiceHealth(
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const services = (input.services as string[]) || [];
  const mcp = getMCPProviderForUser(userId);

  const spl = `index=_internal earliest=-1h
    | stats count as total, count(eval(log_level="ERROR")) as errors by component
    | eval health_score=round((1-(errors/total))*100, 1)
    | eval status=case(health_score>=99, "HEALTHY", health_score>=95, "DEGRADED", 1=1, "CRITICAL")
    | sort -errors`;

  try {
    const results = await mcp.searchSplunk(spl, { earliest: "-1h", latest: "now" });
    return {
      timestamp: new Date().toISOString(),
      services: results,
      summary: `Checked health of ${Array.isArray(results) ? results.length : 0} components`,
    };
  } catch (error) {
    return { error: String(error) };
  }
}

async function executeGetBlastRadius(
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const services = input.services as string[];

  const blastRadius = calculateBlastRadius(userId, services);

  return {
    services,
    ...blastRadius,
    visualization: generateDependencyTree(services, blastRadius.cascadeAffected),
  };
}

function generateDependencyTree(
  services: string[],
  cascade: Array<{ serviceName: string; affectedBy: string; criticality: string }>
): string {
  const lines = services.map((s) => `[${s}]`);

  for (const c of cascade) {
    const indent = "  ";
    const critIcon = c.criticality === "critical" ? "🔴" : c.criticality === "high" ? "🟠" : "🟢";
    lines.push(`${indent}└── ${critIcon} ${c.serviceName} (depends on ${c.affectedBy})`);
  }

  return lines.join("\n");
}

async function executeSendSlack(
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const message = input.message as string;
  const severity = (input.severity as string) || "info";

  const slack = getSlackServiceForUser(userId);
  if (!slack) {
    return { error: "Slack not configured. Please set up Slack integration first." };
  }

  const success = await slack.send({
    text: `${severity === "critical" ? "🚨" : severity === "warning" ? "⚠️" : "ℹ️"} ${message}`,
  });

  return {
    sent: success,
    message,
    severity,
    timestamp: new Date().toISOString(),
  };
}

async function executeQueryPastIncidents(
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const services = input.services as string[];
  const limit = (input.limit as number) || 10;

  const memory = queryMemoryForServices(userId, services, limit);

  return {
    services,
    totalIncidents: memory.totalSimilarIncidents,
    historicalSuccessRate: Math.round(memory.historicalSuccessRate * 100) + "%",
    patterns: memory.patternSummary,
    recentDecisions: memory.relevantDecisions,
    successfulActions: memory.successfulActions,
    rejectedActions: memory.rejectedActions.map((r) => r.recommendation),
  };
}
