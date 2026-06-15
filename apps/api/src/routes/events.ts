import { Router, Response } from "express";
import type { ServerEvent } from "@aegis/shared";

export const eventsRouter = Router();

// Store active SSE connections per incident
const connections = new Map<string, Set<Response>>();

// Store connections for all events (dashboard)
const globalConnections = new Set<Response>();

/**
 * GET /api/events/stream
 * Global SSE stream for all incidents (dashboard view)
 */
eventsRouter.get("/stream", (req, res) => {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

  // Add to global connections
  globalConnections.add(res);

  console.log(`[SSE] Global client connected (${globalConnections.size} total)`);

  // Handle client disconnect
  req.on("close", () => {
    globalConnections.delete(res);
    console.log(`[SSE] Global client disconnected (${globalConnections.size} remaining)`);
  });
});

/**
 * GET /api/events/stream/:incidentId
 * SSE stream for a specific incident
 */
eventsRouter.get("/stream/:incidentId", (req, res) => {
  const { incidentId } = req.params;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: "subscribed", incidentId, timestamp: new Date().toISOString() })}\n\n`);

  // Add to incident-specific connections
  if (!connections.has(incidentId)) {
    connections.set(incidentId, new Set());
  }
  connections.get(incidentId)!.add(res);

  console.log(`[SSE] Client subscribed to ${incidentId}`);

  // Handle client disconnect
  req.on("close", () => {
    connections.get(incidentId)?.delete(res);
    if (connections.get(incidentId)?.size === 0) {
      connections.delete(incidentId);
    }
    console.log(`[SSE] Client unsubscribed from ${incidentId}`);
  });
});

/**
 * Broadcast event to all clients subscribed to an incident
 */
export function broadcastToIncident(incidentId: string, event: ServerEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;

  // Send to incident-specific subscribers
  const incidentConnections = connections.get(incidentId);
  if (incidentConnections) {
    for (const res of incidentConnections) {
      res.write(data);
    }
  }

  // Also send to global subscribers
  for (const res of globalConnections) {
    res.write(data);
  }
}

/**
 * Broadcast event to all global connections
 */
export function broadcastGlobal(event: ServerEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of globalConnections) {
    res.write(data);
  }
}

/**
 * Broadcast event to a specific user (currently broadcasts globally)
 * In production, track connections per authenticated user
 */
export function broadcastToUser(userId: string, event: unknown): void {
  // For now, broadcast to all global connections
  // The frontend filters by userId if needed
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of globalConnections) {
    res.write(data);
  }
}

/**
 * Get count of active connections
 */
export function getConnectionStats(): { global: number; incidents: Record<string, number> } {
  const incidents: Record<string, number> = {};
  for (const [id, conns] of connections) {
    incidents[id] = conns.size;
  }
  return {
    global: globalConnections.size,
    incidents,
  };
}
