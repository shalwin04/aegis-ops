/**
 * Splunk MCP Provider interfaces and types
 */

export interface SearchResult {
  results: Array<Record<string, unknown>>;
  messages?: Array<{ type: string; text: string }>;
  stats?: {
    scanCount?: number;
    eventCount?: number;
    resultCount?: number;
    runDuration?: number;
  };
}

export interface IndexInfo {
  name: string;
  sourcetypes: string[];
  eventCount?: number;
  totalSize?: string;
}

export interface SPLGenerationResult {
  query: string;
  explanation: string;
  confidence: number;
}

export interface SPLExplanation {
  summary: string;
  breakdown: Array<{
    clause: string;
    explanation: string;
  }>;
}

export interface AgentDecisionLog {
  timestamp: string;
  incidentId: string;
  agent: "healer" | "sentinel" | "architect";
  actionType: "diagnosis" | "threat_found" | "mitigation" | "optimization";
  affectedServices: string[];
  findings: Record<string, unknown>;
  recommendation: string;
  humanDecision: "approved" | "rejected" | "modified" | "pending";
  blastRadiusScore: number;
}

/**
 * MCPProvider interface - abstraction over live and mock Splunk MCP
 */
export interface MCPProvider {
  /**
   * Execute a SPL query against Splunk
   */
  searchSplunk(query: string, options?: SearchOptions): Promise<SearchResult>;

  /**
   * Get available indexes and their sourcetypes
   */
  getIndexesAndSourcetypes(): Promise<IndexInfo[]>;

  /**
   * Generate SPL query from natural language using Splunk AI
   */
  generateSPL(prompt: string): Promise<SPLGenerationResult>;

  /**
   * Explain an existing SPL query using Splunk AI
   */
  explainSPL(query: string): Promise<SPLExplanation>;

  /**
   * Ingest an event into Splunk (for agent memory)
   */
  ingestEvent(event: AgentDecisionLog): Promise<void>;

  /**
   * Query historical agent decisions for context
   */
  queryAgentMemory(
    service: string,
    lookback: number
  ): Promise<AgentDecisionLog[]>;
}

export interface SearchOptions {
  earliest?: string;
  latest?: string;
  maxResults?: number;
}

export interface MCPConfig {
  mode: "live" | "mock";
  endpoint?: string;
  token?: string;
  index: string;
}
