import { Router, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { encrypt } from "../utils/crypto.js";
import { LiveSplunkMCP } from "../mcp/live-provider.js";
import { invalidateUserProvider } from "../mcp/index.js";
import { config } from "../config.js";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schema
const connectSchema = z.object({
  host: z
    .string()
    .min(1, "Host is required")
    .max(255, "Host too long")
    .regex(/^[a-zA-Z0-9.-]+$/, "Invalid host format"),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(443),
  token: z
    .string()
    .min(1, "Token is required")
    .max(1000, "Token too long"),
  isSplunkCloud: z.boolean().default(true),
});

/**
 * Build the MCP endpoint URL
 * Splunk Cloud: port 8089 is blocked externally, use 443 with proxy path
 * Splunk Enterprise: direct access on port 8089
 */
function buildMCPEndpoint(host: string, port: number, isSplunkCloud: boolean): string {
  if (isSplunkCloud) {
    // Splunk Cloud blocks 8089 externally, use web proxy on 443
    return `https://${host}:443/en-US/splunkd/__raw/services/mcp`;
  }
  // Splunk Enterprise - direct access
  return `https://${host}:${port}/services/mcp`;
}

/**
 * POST /splunk/connect - Save and verify Splunk connection
 */
router.post("/connect", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = connectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Validation failed",
        details: parsed.error.errors,
      });
      return;
    }

    const { host, port, token, isSplunkCloud } = parsed.data;
    const userId = req.userId!;

    // Verify connection works before saving
    try {
      const endpoint = buildMCPEndpoint(host, port, isSplunkCloud);
      console.log(`[Splunk Connect] Testing connection to: ${endpoint}`);

      const testProvider = new LiveSplunkMCP({
        endpoint,
        token,
        index: config.splunk.index,
      });

      // Test the connection by getting indexes
      await testProvider.getIndexesAndSourcetypes();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[Splunk Connect] Connection test failed:", errorMessage);

      // Provide helpful error details
      let suggestion = "Please verify your host, port, and token are correct.";
      if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ETIMEDOUT")) {
        suggestion = "Connection refused. For Splunk Cloud, try port 443 instead of 8089.";
      } else if (errorMessage.includes("404")) {
        suggestion = "MCP endpoint not found. Ensure the Splunk MCP Server app is installed on your Splunk instance.";
      } else if (errorMessage.includes("401") || errorMessage.includes("403")) {
        suggestion = "Authentication failed. Verify your token has 'mcp' audience tag.";
      }

      res.status(400).json({
        error: "Failed to connect to Splunk",
        details: suggestion,
        technicalError: errorMessage,
      });
      return;
    }

    // Encrypt and store the token
    const { encrypted, iv, tag } = encrypt(token);

    db.saveSplunkConnection({
      id: uuidv4(),
      userId,
      host,
      port,
      tokenEncrypted: encrypted,
      tokenIv: iv,
      tokenTag: tag,
      isSplunkCloud,
      isVerified: true,
    });

    // Invalidate any cached provider for this user
    invalidateUserProvider(userId);

    res.json({
      success: true,
      message: "Splunk connected successfully",
      connection: {
        host,
        port,
        isVerified: true,
      },
    });
  } catch (error) {
    console.error("[Splunk Connect] Error:", error);
    res.status(500).json({ error: "Failed to save connection" });
  }
});

/**
 * GET /splunk/status - Check current connection status
 */
router.get("/status", (req: AuthRequest, res: Response) => {
  try {
    const connection = db.getSplunkConnection(req.userId!);

    if (!connection) {
      res.json({
        connected: false,
        message: "No Splunk connection configured",
      });
      return;
    }

    res.json({
      connected: true,
      host: connection.host,
      port: connection.port,
      isVerified: connection.isVerified,
      connectedAt: connection.createdAt,
    });
  } catch (error) {
    console.error("[Splunk Status] Error:", error);
    res.status(500).json({ error: "Failed to get connection status" });
  }
});

/**
 * POST /splunk/test - Test current connection
 */
router.post("/test", async (req: AuthRequest, res: Response) => {
  try {
    const connection = db.getSplunkConnection(req.userId!);

    if (!connection) {
      res.status(404).json({ error: "No Splunk connection configured" });
      return;
    }

    // Import and use the user's provider
    const { getMCPProviderForUser } = await import("../mcp/index.js");
    const provider = getMCPProviderForUser(req.userId!);

    try {
      const indexes = await provider.getIndexesAndSourcetypes();
      res.json({
        success: true,
        message: "Connection successful",
        indexes: indexes.slice(0, 5), // Return first 5 indexes as sample
      });
    } catch (error) {
      res.json({
        success: false,
        message: "Connection failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } catch (error) {
    console.error("[Splunk Test] Error:", error);
    res.status(500).json({ error: "Failed to test connection" });
  }
});

/**
 * DELETE /splunk/disconnect - Remove Splunk connection
 */
router.delete("/disconnect", (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Check if connection exists
    const connection = db.getSplunkConnection(userId);
    if (!connection) {
      res.status(404).json({ error: "No Splunk connection to disconnect" });
      return;
    }

    // Delete from database
    db.deleteSplunkConnection(userId);

    // Invalidate cached provider
    invalidateUserProvider(userId);

    res.json({
      success: true,
      message: "Splunk disconnected successfully",
    });
  } catch (error) {
    console.error("[Splunk Disconnect] Error:", error);
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

/**
 * GET /splunk/indexes - List available indexes (requires connection)
 */
router.get("/indexes", async (req: AuthRequest, res: Response) => {
  try {
    const connection = db.getSplunkConnection(req.userId!);

    if (!connection) {
      res.status(404).json({ error: "No Splunk connection configured" });
      return;
    }

    const { getMCPProviderForUser } = await import("../mcp/index.js");
    const provider = getMCPProviderForUser(req.userId!);

    const indexes = await provider.getIndexesAndSourcetypes();
    res.json({ indexes });
  } catch (error) {
    console.error("[Splunk Indexes] Error:", error);
    res.status(500).json({ error: "Failed to fetch indexes" });
  }
});

export default router;
