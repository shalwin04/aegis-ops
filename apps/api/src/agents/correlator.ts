import { ChatAnthropic } from "@langchain/anthropic";
import type { CorrelationVerdict, Severity } from "@aegis/shared";
import { config } from "../config.js";
import { getEventEmitter } from "../graph/workflow.js";
import type { AegisGraphState } from "../graph/state.js";
import { queryMemoryForServices, formatMemoryForPrompt, calculateAdjustedConfidence } from "../utils/memory.js";

const CORRELATOR_PROMPT = `You are the Correlator in the AegisOps system. Your job is to synthesize findings from the Healer and Sentinel agents.

IMPORTANT: You have access to INSTITUTIONAL MEMORY showing similar past incidents.
- Use historical data to boost or reduce your confidence score
- Reference the number of similar past incidents in your summary
- Say things like "I'm 87% confident this is a DDoS based on 5 similar past incidents"
- Learn from patterns in past approvals and rejections

Determine:
1. Is this purely an infrastructure issue, a security incident, or a combination?
2. What is the overall severity based on combined findings + historical patterns?
3. Should this be escalated to human operators immediately?
4. What actions should the Architect prioritize (based on what worked before)?

Provide a clear, concise verdict that:
- States your confidence as a percentage with reasoning
- References similar past incidents if available
- Guides the Architect Agent's recommendations

Respond with a JSON object matching the CorrelationVerdict schema.`;

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

export async function correlatorNode(
  state: AegisGraphState
): Promise<Partial<AegisGraphState>> {
  const emitter = getEventEmitter(state.incidentId);

  emitter?.({
    type: "agent:thinking",
    incidentId: state.incidentId,
    agent: "correlator",
    thought: "Synthesizing findings from Healer and Sentinel agents...",
    timestamp: new Date().toISOString(),
  });

  try {
    const healerFindings = state.healerFindings;
    const sentinelFindings = state.sentinelFindings;

    // ========== DEEP MEMORY LOOP: Query historical patterns ==========
    emitter?.({
      type: "agent:thinking",
      incidentId: state.incidentId,
      agent: "correlator",
      thought: "Analyzing historical incident patterns for confidence scoring...",
      timestamp: new Date().toISOString(),
    });

    const memoryContext = queryMemoryForServices(
      state.userId,
      state.trigger.affectedServices,
      15
    );

    // Calculate confidence adjustment based on history
    const baseConfidence = 0.5; // Starting point
    const { adjustedConfidence, reasoning } = calculateAdjustedConfidence(
      baseConfidence,
      memoryContext
    );

    if (memoryContext.totalSimilarIncidents > 0) {
      emitter?.({
        type: "agent:thinking",
        incidentId: state.incidentId,
        agent: "correlator",
        thought: `Based on ${memoryContext.totalSimilarIncidents} similar incidents: ${reasoning}`,
        timestamp: new Date().toISOString(),
      });
    }

    emitter?.({
      type: "agent:thinking",
      incidentId: state.incidentId,
      agent: "correlator",
      thought: `Healer detected: ${healerFindings?.rootCause || "unknown"}. Sentinel verdict: ${sentinelFindings?.isMalicious ? "THREAT DETECTED" : "no threat"}`,
      timestamp: new Date().toISOString(),
    });

    // Format memory context for LLM
    const memoryPrompt = formatMemoryForPrompt(memoryContext);

    // Use LLM to correlate findings
    const response = await getModel().invoke([
      { role: "system", content: CORRELATOR_PROMPT },
      {
        role: "user",
        content: `Correlate these findings from parallel agent analysis:

HEALER FINDINGS (Observability):
${JSON.stringify(healerFindings, null, 2)}

SENTINEL FINDINGS (Security):
${JSON.stringify(sentinelFindings, null, 2)}

ORIGINAL TRIGGER:
${JSON.stringify(state.trigger, null, 2)}

${memoryPrompt}

CONFIDENCE BASELINE: Start with ${Math.round(adjustedConfidence * 100)}% based on historical data.
${reasoning}

Provide your correlation verdict as a JSON object:
{
  "incidentType": "infrastructure" | "security" | "mixed" | "unknown",
  "confidenceScore": number (0-1, use the baseline as starting point, adjust based on current findings),
  "summary": string (include reference to similar past incidents, e.g., "Based on 5 similar incidents..."),
  "recommendedActions": string[],
  "escalate": boolean,
  "similarIncidentCount": number,
  "confidenceReasoning": string (explain why you're confident/not confident)
}`,
      },
    ]);

    // Parse the response
    const content = response.content.toString();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const verdict: CorrelationVerdict = jsonMatch
      ? JSON.parse(jsonMatch[0])
      : {
          incidentType: "unknown",
          confidenceScore: 0.5,
          summary: "Unable to determine incident type from available data",
          recommendedActions: ["Manual investigation required"],
          escalate: true,
        };

    // Determine severity based on correlation
    let severity: Severity = state.severity;
    if (verdict.incidentType === "security" && sentinelFindings?.isMalicious) {
      severity = sentinelFindings.confidence > 0.8 ? "critical" : "high";
    } else if (verdict.incidentType === "mixed") {
      severity = "high";
    } else if (healerFindings?.errorRate && healerFindings.errorRate > 10) {
      severity = "high";
    }

    emitter?.({
      type: "correlation:complete",
      incidentId: state.incidentId,
      verdict,
      timestamp: new Date().toISOString(),
    });

    return {
      correlationVerdict: verdict,
      severity,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      errors: [
        {
          agent: "correlator",
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      ],
      correlationVerdict: {
        incidentType: "unknown",
        confidenceScore: 0,
        summary: `Correlation failed: ${errorMessage}`,
        recommendedActions: ["Manual investigation required"],
        escalate: true,
      },
    };
  }
}
