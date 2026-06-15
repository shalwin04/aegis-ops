import type { MCPProvider } from "@aegis/shared";
import { config } from "../config.js";
import { MockSplunkMCP } from "./mock-provider.js";
import { LiveSplunkMCP } from "./live-provider.js";
import { db } from "../db/index.js";
import { decrypt } from "../utils/crypto.js";

// Cache for user-specific MCP providers (cleared periodically)
const userProviderCache = new Map<string, { provider: MCPProvider; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Global fallback provider (for non-multi-tenant mode)
let globalInstance: MCPProvider | null = null;

/**
 * Get MCP provider for a specific user
 * Uses the user's stored Splunk credentials if available
 * Falls back to global config if user has no connection but global mode is live
 */
export function getMCPProviderForUser(userId: string): MCPProvider {
  // Check cache first
  const cached = userProviderCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.provider;
  }

  // Get user's Splunk connection
  const connection = db.getSplunkConnection(userId);

  if (!connection) {
    // No user-specific connection - check if global live mode is configured
    if (config.splunk.mode === "live" && config.splunk.mcpEndpoint && config.splunk.token) {
      console.log(`[MCP] No user connection, using global live config for user ${userId}`);
      const provider = new LiveSplunkMCP({
        endpoint: config.splunk.mcpEndpoint,
        token: config.splunk.token,
        index: config.splunk.index,
      });
      userProviderCache.set(userId, {
        provider,
        expiresAt: Date.now() + CACHE_TTL,
      });
      return provider;
    }

    // Fall back to mock provider
    const provider = new MockSplunkMCP();
    userProviderCache.set(userId, {
      provider,
      expiresAt: Date.now() + CACHE_TTL,
    });
    return provider;
  }

  // Decrypt token and create live provider
  try {
    const token = decrypt(
      connection.tokenEncrypted,
      connection.tokenIv,
      connection.tokenTag
    );

    // Construct the MCP Server endpoint
    // Splunk Cloud blocks 8089 externally, use web proxy on 443
    const endpoint = connection.isSplunkCloud
      ? `https://${connection.host}:443/en-US/splunkd/__raw/services/mcp`
      : `https://${connection.host}:${connection.port}/services/mcp`;

    const provider = new LiveSplunkMCP({
      endpoint,
      token,
      index: config.splunk.index,
    });

    userProviderCache.set(userId, {
      provider,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return provider;
  } catch (error) {
    console.error(`[MCP] Failed to decrypt token for user ${userId}:`, error);
    // Fall back to mock on decryption error
    return new MockSplunkMCP();
  }
}

/**
 * Invalidate cached provider for a user (call after credential change)
 */
export function invalidateUserProvider(userId: string): void {
  userProviderCache.delete(userId);
}

/**
 * Get global MCP provider (for backwards compatibility / non-multi-tenant mode)
 */
export function getMCPProvider(): MCPProvider {
  if (!globalInstance) {
    globalInstance =
      config.splunk.mode === "live"
        ? new LiveSplunkMCP({
            endpoint: config.splunk.mcpEndpoint!,
            token: config.splunk.token!,
            index: config.splunk.index,
          })
        : new MockSplunkMCP();
  }
  return globalInstance;
}

/**
 * Reset global provider (for testing)
 */
export function resetMCPProvider(): void {
  globalInstance = null;
}

/**
 * Clear all cached providers
 */
export function clearProviderCache(): void {
  userProviderCache.clear();
}

// Periodically clean up expired cache entries
setInterval(() => {
  const now = Date.now();
  for (const [userId, cached] of userProviderCache.entries()) {
    if (cached.expiresAt < now) {
      userProviderCache.delete(userId);
    }
  }
}, CACHE_TTL);
