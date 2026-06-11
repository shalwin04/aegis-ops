import { ChatAnthropic } from "@langchain/anthropic";
import type { HealerFindings } from "@aegis/shared";
import { config } from "../config.js";
import { getEventEmitter } from "../graph/workflow.js";
import { getMCPProviderForUser } from "../mcp/index.js";
import type { AegisGraphState } from "../graph/state.js";
import { buildServiceQuery } from "../utils/splunk.js";
import { queryMemoryForServices, formatMemoryForPrompt, calculateAdjustedConfidence } from "../utils/memory.js";

const HEALER_PROMPT = `You are the Healer Agent in the AegisOps system, specialized in observability and system health diagnosis.

Your responsibilities:
1. Analyze latency spikes, error rates, and trace data from Splunk
2. Identify root causes of performance degradation
3. Detect anomalous traffic patterns that might indicate non-organic issues
4. Map service dependencies affected by the incident

IMPORTANT: You have access to INSTITUTIONAL MEMORY - past incidents and decisions for similar services.
- When you see patterns from past incidents, reference them in your analysis
- Learn from what worked before and what was rejected
- Adjust your confidence based on historical data
- Say things like "Based on 5 similar incidents, this pattern typically indicates..."

When you detect patterns that suggest malicious activity (identical payloads, geographic anomalies, timing patterns), flag them for the Sentinel Agent.

Always provide:
- Quantified metrics (latency in ms, error rates as percentages)
- List of affected services
- Confidence level in your diagnosis (ADJUST based on historical data)
- Any anomaly signatures you detect
- Reference to similar past incidents if available

Analyze the incident and respond with a JSON object matching the HealerFindings schema.`;

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

export async function healerNode(
  state: AegisGraphState
): Promise<Partial<AegisGraphState>> {
  const emitter = getEventEmitter(state.incidentId);
  const mcp = getMCPProviderForUser(state.userId);

  emitter?.({
    type: "agent:thinking",
    incidentId: state.incidentId,
    agent: "healer",
    thought: "Initializing observability analysis...",
    timestamp: new Date().toISOString(),
  });

  try {
    // ========== DEEP MEMORY LOOP: Query past incidents first ==========
    emitter?.({
      type: "agent:thinking",
      incidentId: state.incidentId,
      agent: "healer",
      thought: "Querying institutional memory for similar past incidents...",
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
        agent: "healer",
        thought: `Found ${memoryContext.totalSimilarIncidents} similar past incidents. Historical success rate: ${Math.round(memoryContext.historicalSuccessRate * 100)}%`,
        timestamp: new Date().toISOString(),
      });
    }

    // ========== Query Splunk for current incident data ==========
    const services = state.trigger.affectedServices.join("|");
    const errorQuery = `index=_internal (log_level=ERROR OR log_level=WARN) earliest=-1h
      | stats count as error_count,
              dc(component) as affected_components,
              latest(_time) as last_error
        by log_level
      | append [search index=_internal sourcetype=splunkd earliest=-1h
        | stats avg(elapsed_ms) as avg_latency, max(elapsed_ms) as max_latency]`;

    // Query Splunk for errors and metrics
    emitter?.({
      type: "agent:tool_call",
      incidentId: state.incidentId,
      agent: "healer",
      tool: "splunk_run_query",
      params: {
        query: errorQuery,
        description: "Analyzing error rates and latency from Splunk internal logs",
      },
      timestamp: new Date().toISOString(),
    });

    const searchResult = await mcp.searchSplunk(errorQuery, { earliest: "-1h", latest: "now" });

    emitter?.({
      type: "agent:tool_result",
      incidentId: state.incidentId,
      agent: "healer",
      tool: "search_splunk",
      result: searchResult,
      success: true,
      timestamp: new Date().toISOString(),
    });

    emitter?.({
      type: "agent:thinking",
      incidentId: state.incidentId,
      agent: "healer",
      thought: "Analyzing trace data and error patterns with historical context...",
      timestamp: new Date().toISOString(),
    });

    // Format memory context for LLM
    const memoryPrompt = formatMemoryForPrompt(memoryContext);

    // Use LLM to analyze and generate findings
    const response = await getModel().invoke([
      { role: "system", content: HEALER_PROMPT },
      {
        role: "user",
        content: `Analyze this incident:

Trigger: ${JSON.stringify(state.trigger)}

Splunk APM Data: ${JSON.stringify(searchResult)}

${memoryPrompt}

IMPORTANT: Use the institutional memory above to inform your analysis.
- Reference similar past incidents when applicable
- Adjust your confidence based on historical patterns
- Learn from what worked/failed before

Provide your findings as a JSON object with this structure:
{
  "latencySpike": boolean,
  "latencyMs": number,
  "baselineLatencyMs": number,
  "errorRate": number,
  "errorRateBaseline": number,
  "affectedServices": string[],
  "traces": [],
  "rootCause": string,
  "anomalySignature": string or null,
  "memoryInsights": string (reference to similar past incidents if any)
}`,
      },
    ]);

    // Parse the response
    const content = response.content.toString();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const findings: HealerFindings = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : {
          latencySpike: true,
          latencyMs: 2500,
          baselineLatencyMs: 150,
          errorRate: 15.5,
          errorRateBaseline: 0.5,
          affectedServices: state.trigger.affectedServices,
          traces: [],
          rootCause: "Unable to determine from available data",
          anomalySignature: null,
        };

    emitter?.({
      type: "agent:complete",
      incidentId: state.incidentId,
      agent: "healer",
      findings: findings as unknown as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    });

    return {
      healerFindings: findings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    emitter?.({
      type: "agent:complete",
      incidentId: state.incidentId,
      agent: "healer",
      findings: { error: errorMessage },
      timestamp: new Date().toISOString(),
    });

    return {
      errors: [
        {
          agent: "healer",
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}
