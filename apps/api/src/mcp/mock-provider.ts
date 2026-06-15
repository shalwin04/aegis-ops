import type {
  MCPProvider,
  SearchResult,
  IndexInfo,
  SPLGenerationResult,
  SPLExplanation,
  AgentDecisionLog,
  SearchOptions,
} from "@aegis/shared";

/**
 * Mock Splunk MCP Provider for development and demos
 * Returns realistic canned responses with simulated latency
 */
export class MockSplunkMCP implements MCPProvider {
  private agentMemory: AgentDecisionLog[] = [];
  private simulatedLatency = { min: 200, max: 800 };

  private async simulateDelay(): Promise<void> {
    const delay =
      Math.random() * (this.simulatedLatency.max - this.simulatedLatency.min) +
      this.simulatedLatency.min;
    await new Promise((r) => setTimeout(r, delay));
  }

  async searchSplunk(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult> {
    await this.simulateDelay();

    // Return different mock data based on query content
    if (query.includes("apm") || query.includes("traces")) {
      return this.getMockAPMData();
    }
    if (query.includes("firewall") || query.includes("auth")) {
      return this.getMockSecurityData();
    }
    if (query.includes("aegis") && query.includes("agent_decision")) {
      return this.getMockAgentMemory();
    }

    return this.getGenericMockData();
  }

  async getIndexesAndSourcetypes(): Promise<IndexInfo[]> {
    await this.simulateDelay();

    return [
      {
        name: "main",
        sourcetypes: ["syslog", "access_combined", "json"],
        eventCount: 15420000,
        totalSize: "45.2GB",
      },
      {
        name: "apm",
        sourcetypes: ["otel_traces", "apm_transactions", "apm_errors"],
        eventCount: 8750000,
        totalSize: "28.1GB",
      },
      {
        name: "firewall",
        sourcetypes: ["pan:traffic", "cisco:asa", "aws:cloudtrail"],
        eventCount: 42100000,
        totalSize: "125.6GB",
      },
      {
        name: "auth",
        sourcetypes: ["okta:log", "azure:ad", "linux:auth"],
        eventCount: 3200000,
        totalSize: "8.4GB",
      },
      {
        name: "aegis",
        sourcetypes: ["aegis:agent_decision", "aegis:incident"],
        eventCount: 15000,
        totalSize: "50MB",
      },
    ];
  }

  async generateSPL(prompt: string): Promise<SPLGenerationResult> {
    await this.simulateDelay();

    // Generate contextual SPL based on prompt
    if (prompt.includes("security") || prompt.includes("threat")) {
      return {
        query: `index=firewall OR index=auth
| eval is_suspicious=if(action="blocked" OR (src_ip!=dest_ip AND country!="US"), 1, 0)
| stats count as total_events,
        sum(is_suspicious) as suspicious_events,
        dc(src_ip) as unique_sources
        by service, action
| where suspicious_events > 10
| sort -suspicious_events`,
        explanation:
          "Identifies suspicious activity by correlating firewall blocks with authentication events, flagging non-US traffic patterns",
        confidence: 0.85,
      };
    }

    if (prompt.includes("latency") || prompt.includes("performance")) {
      return {
        query: `index=apm sourcetype=otel_traces
| eval latency_bucket=case(
    duration<100, "fast",
    duration<500, "normal",
    duration<2000, "slow",
    true(), "critical")
| stats count, avg(duration) as avg_latency,
        perc95(duration) as p95_latency
        by service, latency_bucket
| where latency_bucket IN ("slow", "critical")
| sort -count`,
        explanation:
          "Buckets trace data by latency thresholds and surfaces services with slow or critical response times",
        confidence: 0.9,
      };
    }

    // Default monitoring query
    return {
      query: `index=* earliest=-1h
| stats count by index, sourcetype, host
| sort -count
| head 20`,
      explanation:
        "General monitoring query showing top event sources in the last hour",
      confidence: 0.75,
    };
  }

  async explainSPL(query: string): Promise<SPLExplanation> {
    await this.simulateDelay();

    return {
      summary:
        "This SPL query analyzes data across the specified indexes with aggregation and filtering",
      breakdown: [
        {
          clause: "index=*",
          explanation: "Searches across all accessible indexes",
        },
        {
          clause: "| stats count by ...",
          explanation: "Aggregates events and counts them by specified fields",
        },
        {
          clause: "| sort -count",
          explanation: "Sorts results by count in descending order",
        },
      ],
    };
  }

  async ingestEvent(event: AgentDecisionLog): Promise<void> {
    await this.simulateDelay();
    this.agentMemory.push(event);
    console.log(`[MockMCP] Ingested agent decision: ${event.incidentId}`);
  }

  async queryAgentMemory(
    service: string,
    lookback: number
  ): Promise<AgentDecisionLog[]> {
    await this.simulateDelay();

    // Return stored decisions plus some mock historical data
    const historical = this.getMockHistoricalDecisions(service);
    const combined = [...this.agentMemory, ...historical];

    return combined
      .filter((d) => d.affectedServices.includes(service))
      .slice(0, lookback);
  }

  // ============================================
  // Mock Data Generators
  // ============================================

  private getMockAPMData(): SearchResult {
    return {
      results: [
        {
          service: "payment-service",
          avg_latency: 4500,  // Critical: > 3000ms
          max_latency: 12000,
          p95_latency: 8000,
          errors: 1247,
          total: 15420,
          error_rate: 25.5,  // Critical: > 20%
          count: 15420,
        },
        {
          service: "api-gateway",
          avg_latency: 3200,  // High: > 2000ms
          max_latency: 8500,
          p95_latency: 5200,
          errors: 842,
          total: 12900,
          error_rate: 15.2,
          count: 12900,
        },
        {
          service: "user-service",
          avg_latency: 2100,
          max_latency: 4500,
          p95_latency: 3200,
          errors: 312,
          total: 8500,
          error_rate: 8.5,
          count: 8500,
        },
      ],
      messages: [],
      stats: {
        scanCount: 89320,
        eventCount: 89320,
        resultCount: 3,
        runDuration: 0.45,
      },
    };
  }

  private getMockSecurityData(): SearchResult {
    return {
      results: [
        {
          src_ip: "185.220.101.42",
          action: "blocked",
          count: 4520,
          country: "RU",
          threat_score: 0.92,
        },
        {
          src_ip: "45.155.205.89",
          action: "blocked",
          count: 3890,
          country: "CN",
          threat_score: 0.88,
        },
        {
          src_ip: "192.168.1.105",
          action: "allowed",
          count: 2100,
          country: "US",
          threat_score: 0.15,
        },
        {
          src_ip: "103.75.201.44",
          action: "blocked",
          count: 1850,
          country: "VN",
          threat_score: 0.79,
        },
        {
          src_ip: "23.94.21.156",
          action: "challenged",
          count: 980,
          country: "US",
          threat_score: 0.45,
        },
      ],
      messages: [
        {
          type: "INFO",
          text: "Detected potential credential stuffing pattern",
        },
      ],
      stats: {
        scanCount: 245000,
        eventCount: 13340,
        resultCount: 5,
        runDuration: 1.2,
      },
    };
  }

  private getMockAgentMemory(): SearchResult {
    return {
      results: this.agentMemory.map((m) => ({ ...m })),
      messages: [],
      stats: {
        scanCount: this.agentMemory.length,
        eventCount: this.agentMemory.length,
        resultCount: this.agentMemory.length,
        runDuration: 0.1,
      },
    };
  }

  private getGenericMockData(): SearchResult {
    return {
      results: [
        { _time: new Date().toISOString(), event: "Mock event 1" },
        { _time: new Date().toISOString(), event: "Mock event 2" },
      ],
      messages: [],
      stats: {
        scanCount: 100,
        eventCount: 2,
        resultCount: 2,
        runDuration: 0.05,
      },
    };
  }

  private getMockHistoricalDecisions(service: string): AgentDecisionLog[] {
    return [
      {
        timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        incidentId: "INC-HIST001",
        agent: "sentinel",
        actionType: "threat_found",
        affectedServices: ["payment-gateway", "user-auth"],
        findings: {
          attackVector: "credential-stuffing",
          suspiciousIPs: ["185.220.101.42"],
        },
        recommendation: "Block suspicious IPs via WAF",
        humanDecision: "approved",
        blastRadiusScore: 7.5,
      },
      {
        timestamp: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        incidentId: "INC-HIST002",
        agent: "healer",
        actionType: "diagnosis",
        affectedServices: ["payment-gateway"],
        findings: { rootCause: "Database connection pool exhaustion" },
        recommendation: "Increase connection pool size",
        humanDecision: "approved",
        blastRadiusScore: 5.2,
      },
    ];
  }
}
