import type {
  ExecutionPlan,
  Action,
  CodePatchAction,
} from "@aegis/shared";
import OpenAI from "openai";
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

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
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

  const prompt = `You are a senior software engineer fixing a production incident. Your job is to analyze the code and identify potential issues that could cause the described incident, then fix them.

## Incident Description
${incidentDescription}

## Incident Type
${errorType}

## Context from Logs and Analysis
${errorPattern}

## File to Analyze and Fix
Path: ${filePath}
Language: ${language}

\`\`\`${language}
${fileContent}
\`\`\`

## Task
1. Analyze this code in the context of the incident
2. Identify what in this code could cause or contribute to the incident (latency, errors, security issues, etc.)
3. Generate a practical fix that addresses the issue

## What to look for based on incident type:
- **Latency/Timeout issues**: Missing timeouts, no connection pooling, blocking operations, inefficient queries, missing caching
- **Error spikes**: Missing error handling, null checks, validation, try-catch blocks
- **Security issues**: Missing input validation, SQL injection risks, XSS vulnerabilities, insecure configurations
- **Connection issues**: Missing retry logic, circuit breakers, connection pool exhaustion

## Requirements
- Make a meaningful but minimal change to fix the issue
- Add proper error handling, timeouts, or validation as needed
- Focus on production-readiness and reliability
- Do not change unrelated code
- Return the COMPLETE fixed file content

## Response Format
Respond with a JSON object (no markdown, just raw JSON):
{
  "rootCause": "Brief explanation of what in this code could cause the incident",
  "description": "One-line description of the fix (for PR title, e.g., 'Add connection timeout and retry logic')",
  "fixedContent": "The complete fixed file content with your changes applied"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
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
 * Generate a sample code fix for demo purposes when GitHub is not connected
 */
function generateSampleCodeFix(
  errorType: string,
  serviceName: string,
  description: string
): {
  file: string;
  language: string;
  diff: string;
  originalContent: string;
  fixedContent: string;
  description: string;
  rootCause: string;
} | null {
  const serviceClass = serviceName
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");

  const errorLower = errorType.toLowerCase();

  if (errorLower.includes("null") || errorLower.includes("undefined")) {
    const file = `src/services/${serviceName}/handler.ts`;
    const originalContent = `export async function processRequest(request: Request): Promise<Response> {
  const user = await getUser(request.userId);
  const result = user.account.process(request.data);
  return { success: true, data: result };
}`;
    const fixedContent = `export async function processRequest(request: Request): Promise<Response> {
  const user = await getUser(request.userId);
  if (!user?.account) {
    throw new Error(\`User account not found for userId: \${request.userId}\`);
  }
  const result = user.account.process(request.data);
  return { success: true, data: result };
}`;
    return {
      file,
      language: "typescript",
      diff: `--- a/${file}
+++ b/${file}
@@ -1,5 +1,8 @@
 export async function processRequest(request: Request): Promise<Response> {
   const user = await getUser(request.userId);
+  if (!user?.account) {
+    throw new Error(\`User account not found for userId: \${request.userId}\`);
+  }
   const result = user.account.process(request.data);
   return { success: true, data: result };
 }`,
      originalContent,
      fixedContent,
      description: "Add null safety check for user account",
      rootCause: "Missing null check before accessing user.account property",
    };
  }

  if (errorLower.includes("pool") || errorLower.includes("connection") || errorLower.includes("timeout")) {
    const file = `src/services/${serviceName}/database.ts`;
    const originalContent = `import { Pool } from 'pg';

const pool = new Pool({
  max: 10,
  connectionTimeoutMillis: 30000,
});

export async function query(sql: string, params?: any[]) {
  const client = await pool.connect();
  const result = await client.query(sql, params);
  client.release();
  return result;
}`;
    const fixedContent = `import { Pool } from 'pg';

const pool = new Pool({
  max: 50,  // Increased from 10 to handle load
  connectionTimeoutMillis: 5000,  // Fail fast instead of hanging
  idleTimeoutMillis: 30000,
  allowExitOnIdle: true,
});

export async function query(sql: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } catch (error) {
    console.error('Database query failed:', error);
    throw error;
  } finally {
    client.release();
  }
}`;
    return {
      file,
      language: "typescript",
      diff: `--- a/${file}
+++ b/${file}
@@ -2,15 +2,23 @@ import { Pool } from 'pg';

 const pool = new Pool({
-  max: 10,
-  connectionTimeoutMillis: 30000,
+  max: 50,  // Increased from 10 to handle load
+  connectionTimeoutMillis: 5000,  // Fail fast instead of hanging
+  idleTimeoutMillis: 30000,
+  allowExitOnIdle: true,
 });

 export async function query(sql: string, params?: any[]) {
   const client = await pool.connect();
-  const result = await client.query(sql, params);
-  client.release();
-  return result;
+  try {
+    const result = await client.query(sql, params);
+    return result;
+  } catch (error) {
+    console.error('Database query failed:', error);
+    throw error;
+  } finally {
+    client.release();
+  }
 }`,
      originalContent,
      fixedContent,
      description: "Fix connection pool exhaustion with proper resource management",
      rootCause: "Connection pool size too small (10) and missing try/finally for client release",
    };
  }

  if (errorLower.includes("circuit") || errorLower.includes("retry")) {
    const file = `src/services/${serviceName}/client.ts`;
    const originalContent = `export async function callExternalService(request: any) {
  const response = await fetch(EXTERNAL_API_URL, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return response.json();
}`;
    const fixedContent = `import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(callExternalServiceInternal, {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});

async function callExternalServiceInternal(request: any) {
  const response = await fetch(EXTERNAL_API_URL, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(\`Service returned \${response.status}\`);
  }
  return response.json();
}

export async function callExternalService(request: any) {
  return breaker.fire(request);
}`;
    return {
      file,
      language: "typescript",
      diff: `--- a/${file}
+++ b/${file}
@@ -1,7 +1,24 @@
+import CircuitBreaker from 'opossum';
+
+const breaker = new CircuitBreaker(callExternalServiceInternal, {
+  timeout: 5000,
+  errorThresholdPercentage: 50,
+  resetTimeout: 30000,
+});
+
+async function callExternalServiceInternal(request: any) {
+  const response = await fetch(EXTERNAL_API_URL, {
+    method: 'POST',
+    body: JSON.stringify(request),
+  });
+  if (!response.ok) {
+    throw new Error(\`Service returned \${response.status}\`);
+  }
+  return response.json();
+}
+
 export async function callExternalService(request: any) {
-  const response = await fetch(EXTERNAL_API_URL, {
-    method: 'POST',
-    body: JSON.stringify(request),
-  });
-  return response.json();
+  return breaker.fire(request);
 }`,
      originalContent,
      fixedContent,
      description: "Add circuit breaker pattern to prevent cascade failures",
      rootCause: "Missing circuit breaker causing cascade failures when external service is slow",
    };
  }

  // Default fix for general errors
  const file = `src/services/${serviceName}/index.ts`;
  const originalContent = `export async function handleRequest(req: Request) {
  const data = await processData(req.body);
  return data;
}`;
  const fixedContent = `export async function handleRequest(req: Request) {
  try {
    const data = await processData(req.body);
    return data;
  } catch (error) {
    console.error(\`[${serviceClass}] Error processing request:\`, error);
    throw new ServiceError('Processing failed', { cause: error });
  }
}`;
  return {
    file,
    language: "typescript",
    diff: `--- a/${file}
+++ b/${file}
@@ -1,4 +1,10 @@
 export async function handleRequest(req: Request) {
-  const data = await processData(req.body);
-  return data;
+  try {
+    const data = await processData(req.body);
+    return data;
+  } catch (error) {
+    console.error(\`[${serviceClass}] Error processing request:\`, error);
+    throw new ServiceError('Processing failed', { cause: error });
+  }
 }`,
    originalContent,
    fixedContent,
    description: "Add proper error handling and logging",
    rootCause: "Missing error handling causing unhandled exceptions",
  };
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

    // Check for code-level issues
    const codeIssue = detectCodeIssue(healerFindings, sentinelFindings, trigger.description);

    // Check if GitHub is connected
    const githubConnection = db.getGitHubConnection(state.userId);

    // ALWAYS try to analyze code and create PR if GitHub is connected and there's a mapping
    // Don't require codeIssue.isCodeIssue - any incident can have a code fix
    if (githubConnection) {
      emitter?.({
        type: "agent:thinking",
        incidentId: state.incidentId,
        agent: "architect",
        thought: "GitHub connected. Searching for repository mappings to analyze code...",
        timestamp: new Date().toISOString(),
      });

      // Try to find a mapping for any of the affected services
      for (const service of trigger.affectedServices) {
        const mapping = db.getServiceRepoMapping(state.userId, service);

        if (mapping) {
          emitter?.({
            type: "agent:thinking",
            incidentId: state.incidentId,
            agent: "architect",
            thought: `Found repository mapping: ${service} → ${mapping.repoOwner}/${mapping.repoName}. Exploring repository structure...`,
            timestamp: new Date().toISOString(),
          });

          try {
            const token = decrypt(
              githubConnection.tokenEncrypted,
              githubConnection.tokenIv,
              githubConnection.tokenTag
            );
            const github = new GitHubService(token);

            // Get all source files in the repository
            emitter?.({
              type: "agent:tool_call",
              incidentId: state.incidentId,
              agent: "architect",
              tool: "github_explore_repo",
              params: { repo: `${mapping.repoOwner}/${mapping.repoName}` },
              timestamp: new Date().toISOString(),
            });

            const sourceFiles = await github.findSourceFiles(
              mapping.repoOwner,
              mapping.repoName
            );

            emitter?.({
              type: "agent:tool_result",
              incidentId: state.incidentId,
              agent: "architect",
              tool: "github_explore_repo",
              result: { filesFound: sourceFiles.length, files: sourceFiles.slice(0, 10).map(f => f.path) },
              success: true,
              timestamp: new Date().toISOString(),
            });

            if (sourceFiles.length === 0) {
              emitter?.({
                type: "agent:thinking",
                incidentId: state.incidentId,
                agent: "architect",
                thought: "No source files found in repository. Skipping code analysis.",
                timestamp: new Date().toISOString(),
              });
              break;
            }

            // Determine error type from incident
            const errorType = codeIssue.isCodeIssue
              ? codeIssue.errorType
              : correlationVerdict?.incidentType === "security"
                ? "security vulnerability"
                : "latency timeout error";

            // Find the most relevant file to fix
            const targetFile = github.findRelevantFile(sourceFiles, errorType, service);

            if (targetFile) {
              emitter?.({
                type: "agent:thinking",
                incidentId: state.incidentId,
                agent: "architect",
                thought: `Identified target file for analysis: ${targetFile}`,
                timestamp: new Date().toISOString(),
              });

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
                thought: `Analyzing code and generating fix for ${correlationVerdict?.incidentType} incident...`,
                timestamp: new Date().toISOString(),
              });

              const language = getLanguage(targetFile);

              // Build a rich error pattern from all findings
              const errorPattern = [
                trigger.description,
                healerFindings?.rootCause || "",
                healerFindings?.anomalySignature || "",
                sentinelFindings?.attackVector ? `Attack vector: ${sentinelFindings.attackVector}` : "",
                correlationVerdict?.summary || "",
              ].filter(Boolean).join(". ").slice(0, 500);

              const fix = await generateCodeFix({
                fileContent: fileContent.content,
                filePath: targetFile,
                errorType,
                errorPattern,
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
                  result: {
                    file: targetFile,
                    description: fix.description,
                    rootCause: fix.rootCause,
                    willCreatePR: true
                  },
                  success: true,
                  timestamp: new Date().toISOString(),
                });

                emitter?.({
                  type: "agent:thinking",
                  incidentId: state.incidentId,
                  agent: "architect",
                  thought: `✅ Code fix generated! PR will be created on approval: ${fix.description}`,
                  timestamp: new Date().toISOString(),
                });
              } else {
                emitter?.({
                  type: "agent:thinking",
                  incidentId: state.incidentId,
                  agent: "architect",
                  thought: "Code analysis complete - no changes needed for this file.",
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } catch (error) {
            console.error("[Architect] GitHub code fix failed:", error);
            emitter?.({
              type: "agent:thinking",
              incidentId: state.incidentId,
              agent: "architect",
              thought: `GitHub analysis failed: ${error instanceof Error ? error.message : "Unknown error"}. Continuing with other remediation actions.`,
              timestamp: new Date().toISOString(),
            });
          }

          break; // Only try the first matching service
        }
      }
    } else if (codeIssue.isCodeIssue) {
      // GitHub not connected but code issue detected - generate sample fix for demo
      emitter?.({
        type: "agent:thinking",
        incidentId: state.incidentId,
        agent: "architect",
        thought: "Generating code fix suggestion (connect GitHub to create actual PR)...",
        timestamp: new Date().toISOString(),
      });

      const sampleFix = generateSampleCodeFix(
        codeIssue.errorType,
        trigger.affectedServices[0],
        trigger.description
      );

      if (sampleFix) {
        const codePatchAction: CodePatchAction = {
          type: "code_patch",
          file: sampleFix.file,
          language: sampleFix.language,
          diff: sampleFix.diff,
          originalContent: sampleFix.originalContent,
          fixedContent: sampleFix.fixedContent,
          description: sampleFix.description,
          rootCause: sampleFix.rootCause,
          repository: "your-org/your-repo",
          serviceName: trigger.affectedServices[0],
          createPR: true,
        };

        actions.push(codePatchAction);

        emitter?.({
          type: "agent:tool_result",
          incidentId: state.incidentId,
          agent: "architect",
          tool: "code_fix_generation",
          result: { file: sampleFix.file, description: sampleFix.description },
          success: true,
          timestamp: new Date().toISOString(),
        });
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
