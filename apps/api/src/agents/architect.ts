import type {
  ExecutionPlan,
  Action,
  CodePatchAction,
} from "@aegis/shared";
import Anthropic from "@anthropic-ai/sdk";
import { getEventEmitter } from "../graph/workflow.js";
import { getMCPProviderForUser } from "../mcp/index.js";
import type { AegisGraphState } from "../graph/state.js";
import { escapeSPL } from "../utils/splunk.js";
import { db } from "../db/index.js";
import { decrypt } from "../utils/crypto.js";
import { GitHubService, generateDiff } from "../services/github.js";
import { config } from "../config.js";
import { queryMemoryForServices, type MemoryContext } from "../utils/memory.js";
import { calculateBlastRadius, inferDependenciesFromHistory, type BlastRadiusResult } from "../utils/blastRadius.js";

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

/**
 * Detect if the incident suggests a code-level issue that can be fixed
 */
function detectCodeIssue(
  healerFindings: any,
  sentinelFindings: any,
  description: string
): { isCodeIssue: boolean; errorType: string; errorPattern: string; suggestedFile: string | null } {
  const codeIndicators = [
    "NullPointerException",
    "TypeError",
    "ReferenceError",
    "undefined is not",
    "null reference",
    "cannot read property",
    "division by zero",
    "index out of bounds",
    "stack overflow",
    "memory leak",
    "timeout",
    "connection pool exhausted",
    "retry",
    "exception",
    "error handling",
  ];

  const lowerDesc = description.toLowerCase();
  const healerSummary = healerFindings?.summary?.toLowerCase() || "";
  const combinedText = `${lowerDesc} ${healerSummary}`;

  for (const indicator of codeIndicators) {
    if (combinedText.includes(indicator.toLowerCase())) {
      // Try to extract file path from error
      const filePatterns = [
        /([A-Za-z]+\.(java|ts|js|py|go|rs|rb)):(\d+)/,
        /at\s+[\w.]+\s+\(([^)]+):(\d+)/,
        /File\s+"([^"]+)"/,
      ];

      let suggestedFile: string | null = null;
      for (const pattern of filePatterns) {
        const match = combinedText.match(pattern);
        if (match) {
          suggestedFile = match[1];
          break;
        }
      }

      return {
        isCodeIssue: true,
        errorType: indicator,
        errorPattern: combinedText.slice(0, 200),
        suggestedFile,
      };
    }
  }

  return { isCodeIssue: false, errorType: "", errorPattern: "", suggestedFile: null };
}

/**
 * Generate a code fix using Claude
 */
async function generateCodeFix(params: {
  fileContent: string;
  filePath: string;
  errorType: string;
  errorPattern: string;
  incidentDescription: string;
  language: string;
}): Promise<{ fixedContent: string; description: string; rootCause: string } | null> {
  const { fileContent, filePath, errorType, errorPattern, incidentDescription, language } = params;

  const prompt = `You are a senior software engineer fixing a production incident.

## Incident Description
${incidentDescription}

## Error Type
${errorType}

## Error Pattern from Logs
${errorPattern}

## File to Fix
Path: ${filePath}
Language: ${language}

\`\`\`${language}
${fileContent}
\`\`\`

## Task
1. Analyze the code and identify the root cause of the error
2. Generate a minimal, focused fix
3. Return ONLY the fixed code (the entire file with your fix applied)

## Requirements
- Make the smallest change necessary to fix the issue
- Add proper error handling where needed
- Do not change code style or formatting unnecessarily
- Do not add comments explaining the fix (keep it clean)
- Return the COMPLETE fixed file content

## Response Format
Respond with a JSON object (no markdown, just raw JSON):
{
  "rootCause": "Brief explanation of what caused the error",
  "description": "One-line description of the fix (for PR title)",
  "fixedContent": "The complete fixed file content"
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") return null;

    // Parse the JSON response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]);
    return {
      fixedContent: result.fixedContent,
      description: result.description,
      rootCause: result.rootCause,
    };
  } catch (error) {
    console.error("[Architect] Failed to generate code fix:", error);
    return null;
  }
}

/**
 * Get language from file extension
 */
function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    java: "java",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
  };
  return langMap[ext || ""] || "text";
}

export async function architectNode(
  state: AegisGraphState
): Promise<Partial<AegisGraphState>> {
  const emitter = getEventEmitter(state.incidentId);
  const mcp = getMCPProviderForUser(state.userId);

  emitter?.({
    type: "agent:thinking",
    incidentId: state.incidentId,
    agent: "architect",
    thought: "Designing remediation plan based on correlation verdict...",
    timestamp: new Date().toISOString(),
  });

  try {
    const { correlationVerdict, healerFindings, sentinelFindings, trigger } =
      state;

    // ========== DEEP MEMORY LOOP: Learn from past actions ==========
    emitter?.({
      type: "agent:thinking",
      incidentId: state.incidentId,
      agent: "architect",
      thought: "Querying institutional memory for proven remediation strategies...",
      timestamp: new Date().toISOString(),
    });

    const memoryContext = queryMemoryForServices(
      state.userId,
      trigger.affectedServices,
      15
    );

    if (memoryContext.totalSimilarIncidents > 0) {
      emitter?.({
        type: "agent:thinking",
        incidentId: state.incidentId,
        agent: "architect",
        thought: `Found ${memoryContext.totalSimilarIncidents} similar incidents. ${memoryContext.successfulActions.length} proven actions, ${memoryContext.rejectedActions.length} rejected actions to avoid.`,
        timestamp: new Date().toISOString(),
      });
    }

    // ========== BLAST RADIUS PREDICTION ==========
    emitter?.({
      type: "agent:thinking",
      incidentId: state.incidentId,
      agent: "architect",
      thought: "Calculating blast radius for affected services...",
      timestamp: new Date().toISOString(),
    });

    // Infer dependencies from historical incidents if needed
    inferDependenciesFromHistory(state.userId, trigger.affectedServices);

    // Calculate blast radius
    const blastRadius = calculateBlastRadius(state.userId, trigger.affectedServices);

    if (blastRadius.totalAffected > trigger.affectedServices.length) {
      emitter?.({
        type: "agent:thinking",
        incidentId: state.incidentId,
        agent: "architect",
        thought: `Blast radius: ${blastRadius.totalAffected} services affected (${blastRadius.cascadeAffected.length} cascade). Risk score: ${blastRadius.riskScore}/10`,
        timestamp: new Date().toISOString(),
      });
    }

    if (blastRadius.warnings.length > 0) {
      emitter?.({
        type: "agent:thinking",
        incidentId: state.incidentId,
        agent: "architect",
        thought: `⚠️ ${blastRadius.warnings[0]}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Sanitize service names for SPL prompt
    const sanitizedServices = trigger.affectedServices.map(escapeSPL).join(", ");

    // Generate optimized SPL using Splunk AI
    emitter?.({
      type: "agent:tool_call",
      incidentId: state.incidentId,
      agent: "architect",
      tool: "saia_generate_spl",
      params: {
        prompt: `Create an optimized SPL query to monitor ${sanitizedServices} for ${correlationVerdict?.incidentType} incidents`,
      },
      timestamp: new Date().toISOString(),
    });

    const splResult = await mcp.generateSPL(
      `Create an optimized SPL query to monitor ${sanitizedServices} for ${correlationVerdict?.incidentType} incidents with alerting thresholds`
    );

    emitter?.({
      type: "agent:tool_result",
      incidentId: state.incidentId,
      agent: "architect",
      tool: "saia_generate_spl",
      result: splResult,
      success: true,
      timestamp: new Date().toISOString(),
    });

    emitter?.({
      type: "agent:thinking",
      incidentId: state.incidentId,
      agent: "architect",
      thought: "Generating execution plan with recommended actions...",
      timestamp: new Date().toISOString(),
    });

    // Build actions based on incident type
    const actions: Action[] = [];

    // Security actions
    if (
      correlationVerdict?.incidentType === "security" ||
      correlationVerdict?.incidentType === "mixed"
    ) {
      if (
        sentinelFindings?.suspiciousIPs &&
        sentinelFindings.suspiciousIPs.length > 0
      ) {
        actions.push({
          type: "waf_rule",
          provider: "cloudflare",
          rule: {
            name: `Block suspicious IPs - ${state.incidentId}`,
            expression: `ip.src in {${sentinelFindings.suspiciousIPs.map((ip) => `"${ip}"`).join(" ")}}`,
            action: "block",
            priority: 1,
          },
        });

        actions.push({
          type: "network_isolation",
          targets: sentinelFindings.suspiciousIPs,
          duration: 60,
          reason: `Automated isolation for incident ${state.incidentId}`,
        });
      }

      actions.push({
        type: "notification",
        channel: "slack",
        recipients: ["#security-alerts"],
        message: `🚨 Security incident detected: ${correlationVerdict?.summary}`,
        severity: state.severity,
      });
    }

    // Infrastructure actions
    if (
      correlationVerdict?.incidentType === "infrastructure" ||
      correlationVerdict?.incidentType === "mixed"
    ) {
      actions.push({
        type: "edge_processor_rule",
        name: `Optimize ${trigger.affectedServices[0]} logs`,
        splScript: `# Edge Processor Rule for ${state.incidentId}
# Reduces duplicate error logs during incidents
route_data(
  filter: sourcetype="application" AND level="error",
  pipeline: [
    dedup(keys: ["message", "service"], window: "60s"),
    sample(rate: 0.1, when: count > 1000)
  ],
  destination: "main"
)`,
        description:
          "Deduplicates error logs and samples during high-volume incidents",
        estimatedSavings: 5000,
      });
    }

    // Check for code-level issues and generate fixes
    const codeIssue = detectCodeIssue(healerFindings, sentinelFindings, trigger.description);

    if (codeIssue.isCodeIssue) {
      emitter?.({
        type: "agent:thinking",
        incidentId: state.incidentId,
        agent: "architect",
        thought: `Detected code-level issue: ${codeIssue.errorType}. Checking for GitHub integration...`,
        timestamp: new Date().toISOString(),
      });

      // Check if GitHub is connected and we have a mapping for this service
      const githubConnection = db.getGitHubConnection(state.userId);

      if (githubConnection) {
        // Try to find a mapping for any of the affected services
        for (const service of trigger.affectedServices) {
          const mapping = db.getServiceRepoMapping(state.userId, service);

          if (mapping) {
            emitter?.({
              type: "agent:thinking",
              incidentId: state.incidentId,
              agent: "architect",
              thought: `Found repository mapping: ${mapping.repoOwner}/${mapping.repoName}. Analyzing code...`,
              timestamp: new Date().toISOString(),
            });

            try {
              const token = decrypt(
                githubConnection.tokenEncrypted,
                githubConnection.tokenIv,
                githubConnection.tokenTag
              );
              const github = new GitHubService(token);

              // Try to find the relevant file
              let targetFile = codeIssue.suggestedFile;

              if (!targetFile) {
                // Search for files related to the service
                emitter?.({
                  type: "agent:tool_call",
                  incidentId: state.incidentId,
                  agent: "architect",
                  tool: "github_search",
                  params: { query: service, repo: `${mapping.repoOwner}/${mapping.repoName}` },
                  timestamp: new Date().toISOString(),
                });

                const searchResults = await github.searchFiles(
                  mapping.repoOwner,
                  mapping.repoName,
                  service
                );

                if (searchResults.length > 0) {
                  targetFile = searchResults[0].path;
                }
              }

              if (targetFile) {
                emitter?.({
                  type: "agent:tool_call",
                  incidentId: state.incidentId,
                  agent: "architect",
                  tool: "github_get_file",
                  params: { file: targetFile },
                  timestamp: new Date().toISOString(),
                });

                const fileContent = await github.getFileContent(
                  mapping.repoOwner,
                  mapping.repoName,
                  targetFile
                );

                emitter?.({
                  type: "agent:tool_result",
                  incidentId: state.incidentId,
                  agent: "architect",
                  tool: "github_get_file",
                  result: { path: targetFile, size: fileContent.content.length },
                  success: true,
                  timestamp: new Date().toISOString(),
                });

                emitter?.({
                  type: "agent:thinking",
                  incidentId: state.incidentId,
                  agent: "architect",
                  thought: "Generating code fix using AI...",
                  timestamp: new Date().toISOString(),
                });

                const language = getLanguage(targetFile);
                const fix = await generateCodeFix({
                  fileContent: fileContent.content,
                  filePath: targetFile,
                  errorType: codeIssue.errorType,
                  errorPattern: codeIssue.errorPattern,
                  incidentDescription: trigger.description,
                  language,
                });

                if (fix && fix.fixedContent !== fileContent.content) {
                  const diff = generateDiff(fileContent.content, fix.fixedContent, targetFile);

                  const codePatchAction: CodePatchAction = {
                    type: "code_patch",
                    file: targetFile,
                    language,
                    diff,
                    originalContent: fileContent.content,
                    fixedContent: fix.fixedContent,
                    description: fix.description,
                    rootCause: fix.rootCause,
                    repository: `${mapping.repoOwner}/${mapping.repoName}`,
                    serviceName: service,
                    createPR: true,
                  };

                  actions.push(codePatchAction);

                  emitter?.({
                    type: "agent:tool_result",
                    incidentId: state.incidentId,
                    agent: "architect",
                    tool: "code_fix_generation",
                    result: { file: targetFile, description: fix.description },
                    success: true,
                    timestamp: new Date().toISOString(),
                  });
                }
              }
            } catch (error) {
              console.error("[Architect] GitHub code fix failed:", error);
              // Continue without code fix - other actions will still be added
            }

            break; // Only try the first matching service
          }
        }
      }
    }

    // Always add a monitoring alert
    actions.push({
      type: "splunk_alert",
      alertConfig: {
        name: `${state.incidentId} - Recurrence Monitor`,
        search: splResult.query,
        cronSchedule: "*/5 * * * *",
        alertCondition: "count > 0",
        actions: ["slack", "pagerduty"],
      },
    });

    // Generate the execution plan with memory-informed confidence
    const planId = `PLAN-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Calculate confidence with memory boost
    const baseOverallConfidence =
      (correlationVerdict?.confidenceScore || 0.5) *
      (sentinelFindings?.confidence || 0.5);
    const memoryBoost = memoryContext.confidenceBoost;
    const adjustedConfidence = Math.min(baseOverallConfidence + memoryBoost, 0.99);

    // Build confidence reasoning
    const confidenceReasons: string[] = [];
    if (memoryContext.totalSimilarIncidents > 0) {
      confidenceReasons.push(
        `Based on ${memoryContext.totalSimilarIncidents} similar past incidents`
      );
    }
    if (memoryContext.historicalSuccessRate > 0.8) {
      confidenceReasons.push(
        `${Math.round(memoryContext.historicalSuccessRate * 100)}% historical success rate`
      );
    }
    if (memoryContext.successfulActions.length > 0) {
      confidenceReasons.push(
        `${memoryContext.successfulActions.length} proven remediation strategies available`
      );
    }

    // Build summary with historical context
    let enhancedSummary = correlationVerdict?.summary || "Automated remediation plan";
    if (memoryContext.totalSimilarIncidents > 0) {
      enhancedSummary = `${enhancedSummary}. Analysis backed by ${memoryContext.totalSimilarIncidents} similar past incidents with ${Math.round(memoryContext.historicalSuccessRate * 100)}% success rate.`;
    }

    const executionPlan: ExecutionPlan = {
      id: planId,
      incidentId: state.incidentId,
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry

      title: `Remediation Plan: ${correlationVerdict?.incidentType} incident on ${trigger.affectedServices.join(", ")}`,
      summary: enhancedSummary,
      severity: state.severity,

      diagnosis: {
        healer: healerFindings!,
        sentinel: sentinelFindings!,
        correlation: correlationVerdict!,
      },

      actions,

      projectedImpact: {
        servicesAffected: trigger.affectedServices,
        estimatedCostSavings: actions
          .filter((a) => a.type === "edge_processor_rule")
          .reduce((sum, a) => sum + ((a as any).estimatedSavings || 0), 0),
        riskLevel:
          blastRadius.riskScore >= 8
            ? "high"
            : blastRadius.riskScore >= 5
              ? "medium"
              : "low",
        riskExplanation: blastRadius.impactSummary,
        blastRadius: {
          totalAffected: blastRadius.totalAffected,
          riskScore: blastRadius.riskScore,
          directlyAffected: blastRadius.directlyAffected,
          cascadeAffected: blastRadius.cascadeAffected.map((c) => ({
            service: c.serviceName,
            affectedBy: c.affectedBy,
            criticality: c.criticality,
          })),
          warnings: blastRadius.warnings,
        },
      },

      confidence: {
        overall: adjustedConfidence,
        diagnosis: correlationVerdict?.confidenceScore || 0.5,
        recommendation: splResult.confidence || 0.7,
        reasoning: confidenceReasons.length > 0
          ? confidenceReasons.join(". ")
          : "No historical data available for this incident pattern",
        similarIncidentCount: memoryContext.totalSimilarIncidents,
        historicalSuccessRate: memoryContext.historicalSuccessRate,
      },
    };

    emitter?.({
      type: "agent:complete",
      incidentId: state.incidentId,
      agent: "architect",
      findings: { planId, actionsCount: actions.length },
      timestamp: new Date().toISOString(),
    });

    return {
      architectRecommendation: {
        splQuery: splResult.query,
        edgeProcessorRule: actions.find((a) => a.type === "edge_processor_rule")
          ? (actions.find((a) => a.type === "edge_processor_rule") as any)
              .splScript
          : undefined,
        estimatedCostSavings: executionPlan.projectedImpact.estimatedCostSavings,
      },
      executionPlan,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    emitter?.({
      type: "agent:complete",
      incidentId: state.incidentId,
      agent: "architect",
      findings: { error: errorMessage },
      timestamp: new Date().toISOString(),
    });

    return {
      errors: [
        {
          agent: "architect",
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
