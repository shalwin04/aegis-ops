import { WebSocket } from "ws";
import type { ClientEvent, ServerEvent } from "@aegis/shared";
import { incidentStore } from "../store/incidents.js";
import { runWorkflow } from "../graph/workflow.js";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import jwt from "jsonwebtoken";

// Track authenticated users per WebSocket
const wsUserMap = new Map<WebSocket, string>();

// System user for unauthenticated WebSocket connections (demo mode)
const DEMO_USER_ID = "demo-user";

function ensureDemoUser(): string {
  const existing = db.getUserById(DEMO_USER_ID);
  if (!existing) {
    try {
      db.createUser({
        id: DEMO_USER_ID,
        email: "demo@aegisops.local",
        passwordHash: "", // Can't log in
        name: "Demo User",
      });
    } catch {
      // User might already exist
    }
  }
  return DEMO_USER_ID;
}

function getUserIdFromWs(ws: WebSocket): string {
  return wsUserMap.get(ws) || ensureDemoUser();
}

// Track subscriptions: incidentId -> Set of WebSocket clients
const subscriptions = new Map<string, Set<WebSocket>>();

// Track all connected clients
const clients = new Set<WebSocket>();

export function handleWebSocketConnection(ws: WebSocket): void {
  clients.add(ws);

  ws.on("message", async (data) => {
    try {
      const event: ClientEvent = JSON.parse(data.toString());
      await handleClientEvent(ws, event);
    } catch (error) {
      sendEvent(ws, {
        type: "error",
        error: `Failed to parse message: ${error}`,
        timestamp: new Date().toISOString(),
      });
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    // Remove from all subscriptions
    for (const [incidentId, subs] of subscriptions) {
      subs.delete(ws);
      if (subs.size === 0) {
        subscriptions.delete(incidentId);
      }
    }
    console.log("[WS] Client disconnected");
  });

  ws.on("error", (error) => {
    console.error("[WS] Error:", error);
  });
}

async function handleClientEvent(
  ws: WebSocket,
  event: ClientEvent
): Promise<void> {
  switch (event.type) {
    case "incident:submit": {
      const incidentId = `INC-${uuidv4().slice(0, 8).toUpperCase()}`;
      const userId = getUserIdFromWs(ws);

      // Subscribe this client to the incident
      subscribe(ws, incidentId);

      // Create incident in database
      db.createIncident({
        id: incidentId,
        userId,
        description: event.data.description,
        affectedServices: event.data.affectedServices,
      });

      // Run the workflow
      await runWorkflow(incidentId, userId, event.data, (serverEvent: ServerEvent) => {
        broadcastToIncident(incidentId, serverEvent);
      });
      break;
    }

    case "auth": {
      // Authenticate WebSocket connection with JWT
      try {
        const payload = jwt.verify(
          event.token,
          process.env.JWT_SECRET!
        ) as { userId: string };
        wsUserMap.set(ws, payload.userId);
        sendEvent(ws, {
          type: "auth:success",
          timestamp: new Date().toISOString(),
        });
      } catch {
        sendEvent(ws, {
          type: "auth:failed",
          error: "Invalid token",
          timestamp: new Date().toISOString(),
        });
      }
      break;
    }

    case "subscribe": {
      subscribe(ws, event.incidentId);
      // Send current state if available
      const state = incidentStore.get(event.incidentId);
      if (state) {
        sendEvent(ws, {
          type: "state:update",
          incidentId: event.incidentId,
          state,
          timestamp: new Date().toISOString(),
        });
      }
      break;
    }

    case "unsubscribe": {
      unsubscribe(ws, event.incidentId);
      break;
    }

    case "plan:approve": {
      const state = incidentStore.get(event.incidentId);
      if (state && state.executionPlan?.id === event.planId) {
        // Update state and execute
        incidentStore.update(event.incidentId, (s) => ({
          ...s,
          humanDecision: {
            action: "approved",
            decidedAt: new Date().toISOString(),
          },
          status: "executing",
        }));

        // Broadcast execution start
        broadcastToIncident(event.incidentId, {
          type: "execution:started",
          incidentId: event.incidentId,
          planId: event.planId,
          timestamp: new Date().toISOString(),
        });

        // Execute the plan (simulated for now)
        await executeplan(event.incidentId);
      }
      break;
    }

    case "plan:reject": {
      incidentStore.update(event.incidentId, (s) => ({
        ...s,
        humanDecision: {
          action: "rejected",
          reason: event.reason,
          decidedAt: new Date().toISOString(),
        },
        status: "rejected",
      }));

      broadcastToIncident(event.incidentId, {
        type: "incident:resolved",
        incidentId: event.incidentId,
        summary: `Plan rejected: ${event.reason}`,
        timestamp: new Date().toISOString(),
      });
      break;
    }

    case "plan:modify": {
      // Loop back to architect with modifications
      console.log("[WS] Plan modification requested:", event.edits);
      // TODO: Re-run architect with modifications
      break;
    }

    case "agent:interrupt": {
      // Emergency stop
      console.log("[WS] Interrupt requested for:", event.incidentId);
      incidentStore.update(event.incidentId, (s) => ({
        ...s,
        status: "rejected",
        errors: [
          ...s.errors,
          {
            agent: "correlator",
            error: "Workflow interrupted by user",
            timestamp: new Date().toISOString(),
          },
        ],
      }));
      break;
    }
  }
}

function subscribe(ws: WebSocket, incidentId: string): void {
  if (!subscriptions.has(incidentId)) {
    subscriptions.set(incidentId, new Set());
  }
  subscriptions.get(incidentId)!.add(ws);
  console.log(`[WS] Client subscribed to ${incidentId}`);
}

function unsubscribe(ws: WebSocket, incidentId: string): void {
  subscriptions.get(incidentId)?.delete(ws);
}

export function broadcastToIncident(
  incidentId: string,
  event: ServerEvent
): void {
  const subs = subscriptions.get(incidentId);
  if (subs) {
    for (const client of subs) {
      sendEvent(client, event);
    }
  }
}

function sendEvent(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

async function executeplan(incidentId: string): Promise<void> {
  const state = incidentStore.get(incidentId);
  if (!state?.executionPlan) return;

  const actions = state.executionPlan.actions;
  const executed: string[] = [];

  for (const action of actions) {
    broadcastToIncident(incidentId, {
      type: "execution:progress",
      incidentId,
      action: action.type,
      status: "running",
      timestamp: new Date().toISOString(),
    });

    // Simulate execution delay
    await new Promise((r) => setTimeout(r, 1000));

    executed.push(action.type);

    broadcastToIncident(incidentId, {
      type: "execution:progress",
      incidentId,
      action: action.type,
      status: "completed",
      timestamp: new Date().toISOString(),
    });
  }

  // Update state
  incidentStore.update(incidentId, (s) => ({
    ...s,
    status: "resolved",
    executionResults: {
      success: true,
      actionsExecuted: executed,
      completedAt: new Date().toISOString(),
    },
  }));

  broadcastToIncident(incidentId, {
    type: "execution:complete",
    incidentId,
    success: true,
    results: { actionsExecuted: executed },
    timestamp: new Date().toISOString(),
  });

  broadcastToIncident(incidentId, {
    type: "incident:resolved",
    incidentId,
    summary: `Incident resolved. ${executed.length} actions executed successfully.`,
    timestamp: new Date().toISOString(),
  });
}
