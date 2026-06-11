import type {
  MCPProvider,
  SearchResult,
  IndexInfo,
  SPLGenerationResult,
  SPLExplanation,
  AgentDecisionLog,
  SearchOptions,
} from "@aegis/shared";
import { escapeSPL, validateServiceName } from "../utils/splunk.js";

interface LiveMCPConfig {
  endpoint: string;
  token: string;
  index: string;
}

interface MCPToolResult {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Live Splunk MCP Provider
 * Connects to the official Splunk MCP Server using HTTP POST with JSON-RPC 2.0
 *
 * Requires: Splunk MCP Server app installed on Splunk instance
 * See: https://help.splunk.com/en/splunk-cloud-platform/mcp-server-for-splunk-platform/
 */
export class LiveSplunkMCP implements MCPProvider {
  private endpoint: string;
  private token: string;
  private index: string;
  private requestId = 0;
  private initialized = false;

  constructor(config: LiveMCPConfig) {
    this.endpoint = config.endpoint;
    this.token = config.token;
    this.index = config.index;
  }

  /**
   * Make JSON-RPC 2.0 call to Splunk MCP Server via HTTP POST
   */
  private async rpcCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const isNotification = method.startsWith("notifications/");
    const id = isNotification ? undefined : ++this.requestId;

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(id !== undefined && { id }),
        method,
        params,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Splunk MCP request failed (${response.status}): ${errorText}`);
    }

    // Notifications don't return a response body
    if (isNotification) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text || text.trim() === "") {
      return undefined as T;
    }

    const data = JSON.parse(text) as {
      result?: T;
      error?: { code?: number; message: string };
    };

    if (data.error) {
      throw new Error(`Splunk MCP error: ${data.error.message}`);
    }

    return data.result as T;
  }

  /**
   * Initialize MCP connection (required before calling tools)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    console.log(`[LiveMCP] Initializing connection to: ${this.endpoint}`);

    const result = await this.rpcCall<{
      protocolVersion: string;
      serverInfo: { name: string; version: string };
      capabilities: { tools?: object };
    }>("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "aegis-ops",
        version: "1.0.0",
      },
    });

    console.log(`[LiveMCP] Connected to ${result.serverInfo.name} v${result.serverInfo.version}`);

    // Send initialized notification
    await this.rpcCall("notifications/initialized", {});

    this.initialized = true;

    // List available tools
    const tools = await this.rpcCall<{ tools: Array<{ name: string }> }>("tools/list", {});
    console.log(`[LiveMCP] Available tools: ${tools.tools.map((t) => t.name).join(", ")}`);
  }

  /**
   * Call an MCP tool
   */
  private async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    await this.ensureInitialized();

    console.log(`[LiveMCP] Calling tool: ${name}`);

    const result = await this.rpcCall<MCPToolResult>("tools/call", {
      name,
      arguments: args,
    });

    // Handle tool result
    if (result.isError) {
      const errorText = result.content?.[0]?.text || "Unknown error";
      throw new Error(`Splunk MCP tool error: ${errorText}`);
    }

    // Extract text content from result
    const content = result.content?.[0];
    if (content?.type === "text" && content.text) {
      try {
        return JSON.parse(content.text) as T;
      } catch {
        // Return raw text if not JSON
        return content.text as unknown as T;
      }
    }

    return result as unknown as T;
  }

  /**
   * Execute SPL search query
   * Uses Splunk MCP tool: splunk_run_query
   */
  async searchSplunk(query: string, options?: SearchOptions): Promise<SearchResult> {
    const result = await this.callTool<{
      results?: Array<Record<string, unknown>>;
      messages?: Array<{ type: string; text: string }>;
    }>("splunk_run_query", {
      query,
      earliest_time: options?.earliest || "-24h",
      latest_time: options?.latest || "now",
      row_limit: options?.maxResults || 100,
    });

    return {
      results: result.results || [],
      messages: result.messages,
    };
  }

  /**
   * List available indexes
   * Uses Splunk MCP tool: splunk_get_indexes
   */
  async getIndexesAndSourcetypes(): Promise<IndexInfo[]> {
    const result = await this.callTool<Array<Record<string, unknown>>>("splunk_get_indexes", {
      row_limit: 100,
    });

    // The result is an array of index info objects
    const indexes = Array.isArray(result) ? result : [];
    return indexes.map((idx) => ({
      name: String(idx.name || idx.title || "unknown"),
      sourcetypes: [],
    }));
  }

  /**
   * Generate SPL query from natural language
   * Note: saia_generate_spl may not be available on all instances
   * Falls back to a simple template if not available
   */
  async generateSPL(prompt: string): Promise<SPLGenerationResult> {
    try {
      return await this.callTool<SPLGenerationResult>("saia_generate_spl", {
        prompt,
      });
    } catch {
      // Fallback if SAIA tools not available
      console.log("[LiveMCP] saia_generate_spl not available, using fallback");
      return {
        query: `index=* | search ${prompt.replace(/[^a-zA-Z0-9\s]/g, "")} | head 100`,
        explanation: "Generated basic search query (AI assistant not available)",
        confidence: 0.5,
      };
    }
  }

  /**
   * Explain what an SPL query does
   * Note: saia_explain_spl may not be available on all instances
   */
  async explainSPL(query: string): Promise<SPLExplanation> {
    try {
      return await this.callTool<SPLExplanation>("saia_explain_spl", {
        spl: query,
      });
    } catch {
      // Fallback if SAIA tools not available
      console.log("[LiveMCP] saia_explain_spl not available, using fallback");
      return {
        summary: "SPL query explanation not available (AI assistant not enabled)",
        breakdown: [{ clause: query, explanation: "Full query" }],
      };
    }
  }

  /**
   * Ingest event to Splunk
   * Note: MCP Server may be read-only, log the event for now
   */
  async ingestEvent(event: AgentDecisionLog): Promise<void> {
    console.log(`[LiveMCP] Would ingest event:`, event);
    // TODO: Use HEC or splunk_ingest tool if available
  }

  /**
   * Query past agent decisions for similar services
   */
  async queryAgentMemory(service: string, lookback: number): Promise<AgentDecisionLog[]> {
    if (!validateServiceName(service)) {
      throw new Error(`Invalid service name: ${service}`);
    }

    const escapedService = escapeSPL(service);
    const query = `index="${escapeSPL(this.index)}" sourcetype="aegis:agent_decision"
      | spath affected_services{}
      | search affected_services{}="${escapedService}"
      | head ${Math.min(lookback, 100)}
      | sort -_time`;

    const result = await this.searchSplunk(query);
    return result.results as unknown as AgentDecisionLog[];
  }
}
