/**
 * Chat Routes
 *
 * API endpoints for the agentic chatbot interface.
 */

import { Router, Response } from "express";
import { z } from "zod";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { processChat, ChatMessage, ChatContext } from "../services/chat-agent.js";

export const chatRouter = Router();
chatRouter.use(authMiddleware);

// In-memory conversation storage (per user)
const conversations = new Map<string, ChatMessage[]>();

const chatMessageSchema = z.object({
  message: z.string().min(1).max(5000),
  conversationId: z.string().optional(),
});

/**
 * POST /api/chat
 * Send a message to the AI assistant
 */
chatRouter.post("/", async (req: AuthRequest, res: Response) => {
  const parsed = chatMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid message", details: parsed.error });
    return;
  }

  const { message, conversationId } = parsed.data;
  const userId = req.userId!;

  // Get or create conversation
  const convKey = conversationId || userId;
  let history = conversations.get(convKey) || [];

  // Create context
  const context: ChatContext = {
    userId,
    conversationHistory: history,
  };

  try {
    // Process the chat message
    const toolsUsed: Array<{ tool: string; input: unknown }> = [];

    const response = await processChat(
      message,
      context,
      undefined, // No streaming for now
      (tool, input) => {
        toolsUsed.push({ tool, input });
      }
    );

    // Update conversation history
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: response, toolResults: toolsUsed });

    // Keep last 20 messages
    if (history.length > 20) {
      history = history.slice(-20);
    }
    conversations.set(convKey, history);

    res.json({
      response,
      toolsUsed,
      conversationId: convKey,
    });
  } catch (error) {
    console.error("[Chat] Error processing message:", error);
    res.status(500).json({
      error: "Failed to process message",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/chat/stream
 * Send a message with SSE streaming response
 */
chatRouter.post("/stream", async (req: AuthRequest, res: Response) => {
  const parsed = chatMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid message" });
    return;
  }

  const { message, conversationId } = parsed.data;
  const userId = req.userId!;

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const convKey = conversationId || userId;
  let history = conversations.get(convKey) || [];

  const context: ChatContext = {
    userId,
    conversationHistory: history,
  };

  const toolsUsed: Array<{ tool: string; input: unknown }> = [];
  let fullResponse = "";

  try {
    await processChat(
      message,
      context,
      (chunk) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: "text", content: chunk })}\n\n`);
      },
      (tool, input) => {
        toolsUsed.push({ tool, input });
        res.write(`data: ${JSON.stringify({ type: "tool", tool, input })}\n\n`);
      }
    );

    // Update history
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: fullResponse, toolResults: toolsUsed });
    if (history.length > 20) {
      history = history.slice(-20);
    }
    conversations.set(convKey, history);

    // Send done event
    res.write(`data: ${JSON.stringify({ type: "done", toolsUsed })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: "error", error: String(error) })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/chat/history
 * Get conversation history
 */
chatRouter.get("/history", (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const conversationId = req.query.conversationId as string || userId;

  const history = conversations.get(conversationId) || [];

  res.json({
    conversationId,
    messages: history,
  });
});

/**
 * DELETE /api/chat/history
 * Clear conversation history
 */
chatRouter.delete("/history", (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const conversationId = req.query.conversationId as string || userId;

  conversations.delete(conversationId);

  res.json({ success: true, message: "Conversation cleared" });
});

/**
 * GET /api/chat/suggestions
 * Get suggested prompts based on current state
 */
chatRouter.get("/suggestions", (req: AuthRequest, res: Response) => {
  // Return contextual suggestions
  const suggestions = [
    {
      category: "Observability",
      prompts: [
        "Show me error logs from the last hour",
        "Generate a latency report for all services",
        "What's the health status of the payment service?",
      ],
    },
    {
      category: "Incidents",
      prompts: [
        "List recent incidents",
        "Show me details of the latest incident",
        "What patterns do you see in past incidents?",
      ],
    },
    {
      category: "Code & Fixes",
      prompts: [
        "Analyze the payment service code",
        "Find and fix the null pointer bug",
        "Create a PR to fix the error handling",
      ],
    },
    {
      category: "Actions",
      prompts: [
        "Send a Slack notification about the issue",
        "What's the blast radius if we restart the API service?",
        "Show me service dependencies",
      ],
    },
  ];

  res.json({ suggestions });
});
