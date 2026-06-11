import { ChatAnthropic } from "@langchain/anthropic";
import type { SentinelFindings } from "@aegis/shared";
import { config } from "../config.js";
import { getEventEmitter } from "../graph/workflow.js";
import { getMCPProviderForUser } from "../mcp/index.js";
import type { AegisGraphState } from "../graph/state.js";
import { queryMemoryForServices, formatMemoryForPrompt, calculateAdjustedConfidence } from "../utils/memory.js";

const SENTINEL_PROMPT = `You are the Sentinel Agent in the AegisOps system, specialized in security threat detection and response.

Your responsibilities:
1. Cross-reference suspicious IPs with firewall, authentication, and endpoint logs
2. Identify attack vectors (credential stuffing, DDoS, injection attacks)
3. Assess threat severity and blast radius
4. Propose targeted mitigations (WAF rules, network isolation)

IMPORTANT: You have access to INSTITUTIONAL MEMORY - past security incidents for similar services.
- When you see attack patterns from past incidents, reference them
- Say things like "Based on 8 similar incidents, this IP range has been involved in 3 previous attacks"
- Learn from past security responses that were approved or rejected
- Adjust your confidence based on historical threat patterns

You analyze incidents in parallel with the Healer Agent. Your job is to determine if the incident has a security dimension.

Always provide:
- Clear verdict: is this malicious activity? (with confidence score 0-1, ADJUSTED based on history)
- Attack vector classification if malicious
- List of threat indicators with sources
- Specific, actionable mitigation recommendations
- Reference to similar past security incidents if available

Analyze the incident and respond with a JSON object matching the SentinelFindings schema.`;

let _model: ChatAnthropic | null = null;
function getModel(): ChatAnthropic {
  if (!_model) {
    _model = new ChatAnthropic({
      apiKey: config.anthropic.apiKey,
      model: config.anthropic.model,
    });
  }
  return _model;
}

export async function sentinelNode(
  state: AegisGraphState
): Promise<Partial<AegisGraphState>> {
  const emitter = getEventEmitter(state.incidentId);
  const mcp = getMCPProviderForUser(state.userId);

  emitter?.({
    type: "agent:thinking",
    incidentId: state.incidentId,
    agent: "sentinel",
    thought: "Initiating security threat analysis...",
    timestamp: new Date().toISOString(),
  });

  try {
    // ========== DEEP MEMORY LOOP: Query past security incidents ==========
    emitter?.({
      type: "agent:thinking",
      incidentId: state.incidentId,
      agent: "sentinel",
      thought: "Querying institutional memory for past security incidents...",
      timestamp: new Date().toISOString(),
    });

    const memoryContext = queryMemoryForServices(
      state.userId,
      state.trigger.affectedServices,
      10
    );

    if (memoryContext.totalSimilarIncidents > 0) {
      emitter?.({
        type: "agent:thinking",
        incidentId: state.incidentId,
        agent: "sentinel",
        thought: `Found ${memoryContext.totalSimilarIncidents} past incidents. Analyzing for recurring threat patterns...`,
        timestamp: new Date().toISOString(),
      });
    }

    // ========== Query Splunk for current security data ==========
    // Get available indexes and sourcetypes for cross-referencing
    emitter?.({
      type: "agent:tool_call",
      incidentId: state.incidentId,
      agent: "sentinel",
      tool: "indexes_and_sourcetypes",
      params: {},
      timestamp: new Date().toISOString(),
    });

    const indexes = await mcp.getIndexesAndSourcetypes();

    emitter?.({
      type: "agent:tool_result",
      incidentId: state.incidentId,
      agent: "sentinel",
      tool: "indexes_and_sourcetypes",
      result: indexes,
      success: true,
      timestamp: new Date().toISOString(),
    });

    // Query audit logs for authentication and security events
    // Uses _audit index which has real data in Splunk Cloud
    const auditQuery = `index=_audit action=* earliest=-1h
      | stats count by action, info, user
      | sort -count
      | head 20`;

    emitter?.({
      type: "agent:tool_call",
      incidentId: state.incidentId,
      agent: "sentinel",
      tool: "splunk_run_query",
      params: {
        query: auditQuery,
        description: "Analyzing authentication and security events from audit logs",
      },
      timestamp: new Date().toISOString(),
    });

    const securityLogs = await mcp.searchSplunk(auditQuery, { earliest: "-1h", latest: "now" });

    emitter?.({
      type: "agent:tool_result",
      incidentId: state.incidentId,
      agent: "sentinel",
      tool: "search_splunk",
      result: securityLogs,
      success: true,
      timestamp: new Date().toISOString(),
    });

    emitter?.({
      type: "agent:thinking",
      incidentId: state.incidentId,
      agent: "sentinel",
      thought: "Cross-referencing IPs with threat intelligence and historical patterns...",
      timestamp: new Date().toISOString(),
    });

    // Format memory context for LLM
    const memoryPrompt = formatMemoryForPrompt(memoryContext);

    // Use LLM to analyze and generate findings
    const response = await getModel().invoke([
      { role: "system", content: SENTINEL_PROMPT },
      {
        role: "user",
        content: `Analyze this incident for security threats:

Trigger: ${JSON.stringify(state.trigger)}

Available Indexes: ${JSON.stringify(indexes)}

Security Logs: ${JSON.stringify(securityLogs)}

${memoryPrompt}

IMPORTANT: Use the institutional memory above to inform your security analysis.
- Reference similar past security incidents when applicable
- Identify recurring threat patterns across incidents
- Adjust your confidence based on historical attack patterns
- Note any IPs or attack vectors seen in previous incidents

Provide your findings as a JSON object with this structure:
{
  "isMalicious": boolean,
  "confidence": number (0-1, adjusted based on historical data),
  "attackVector": "credential-stuffing" | "ddos-layer7" | "sql-injection" | "xss" | "brute-force" | "data-exfiltration" | "unknown" | null,
  "threatIndicators": [{ "type": "ip" | "payload" | "behavior" | "geographic", "value": string, "confidence": number, "source": string }],
  "suspiciousIPs": string[],
  "geoDistribution": { "country": count },
  "relatedIncidents": string[],
  "memoryInsights": string (reference to similar past security incidents if any)
}`,
      },
    ]);

    // Parse the response
    const content = response.content.toString();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const findings: SentinelFindings = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : {
          isMalicious: false,
          confidence: 0.3,
          threatIndicators: [],
          suspiciousIPs: [],
        };

    emitter?.({
      type: "agent:complete",
      incidentId: state.incidentId,
      agent: "sentinel",
      findings: findings as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    });

    return {
      sentinelFindings: findings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    emitter?.({
      type: "agent:complete",
      incidentId: state.incidentId,
      agent: "sentinel",
      findings: { error: errorMessage },
      timestamp: new Date().toISOString(),
    });

    return {
      errors: [
        {
          agent: "sentinel",
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
