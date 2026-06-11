import { Router, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { incidentStore } from "../store/incidents.js";
import { runWorkflow, executeApprovedPlan } from "../graph/workflow.js";
import { broadcastToIncident } from "./events.js";
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from "../middleware/auth.js";
import { validateServiceName } from "../utils/splunk.js";
import { db } from "../db/index.js";

export const incidentRouter = Router();

// Validation schema
const createIncidentSchema = z.object({
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(2000, "Description must be under 2000 characters"),
  affectedServices: z
    .array(z.string().min(1).max(100))
    .min(1, "At least one affected service required")
    .max(10, "Maximum 10 services allowed")
    .refine(
      (services) => services.every(validateServiceName),
      "Invalid service name format"
    ),
  source: z.enum(["observability", "security", "manual"]).default("manual"),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

/**
 * GET /api/incidents
 * List all incidents (for authenticated user)
 */
incidentRouter.get("/", authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  // Get from database for persistence
  const dbIncidents = db.getIncidentsByUser(userId);

  res.json({
    incidents: dbIncidents.map((inc) => ({
      id: inc.id,
      status: inc.status,
      severity: inc.severity,
      description: inc.description,
      affectedServices: JSON.parse(inc.affectedServices),
      createdAt: inc.createdAt,
      resolvedAt: inc.resolvedAt,
    })),
  });
});

/**
 * GET /api/incidents/:id
 * Get incident details
 */
incidentRouter.get("/:id", authMiddleware, (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const incidentId = req.params.id;

  // Check in-memory store first (for active incidents)
  const memoryIncident = incidentStore.get(incidentId);
  if (memoryIncident) {
    res.json(memoryIncident);
    return;
  }

  // Check database for historical incidents
  const dbIncident = db.getIncident(incidentId, userId);
  if (dbIncident) {
    res.json(db.dbIncidentToState(dbIncident));
    return;
  }

  res.status(404).json({ error: "Incident not found" });
});

/**
 * POST /api/incidents
 * Create incident manually (requires auth)
 */
incidentRouter.post("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  // Validate input
  const parsed = createIncidentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      details: parsed.error.errors,
    });
    return;
  }

  const { description, affectedServices, source, severity } = parsed.data;
  const userId = req.userId!;
  const incidentId = `INC-${uuidv4().slice(0, 8).toUpperCase()}`;

  // Save to database
  db.createIncident({
    id: incidentId,
    userId,
    description,
    affectedServices,
    severity,
  });

  // Return immediately, workflow runs async
  res.status(201).json({
    incidentId,
    status: "analyzing",
    message: "Incident created and analysis started",
  });

  // Start workflow asynchronously (events broadcast via SSE)
  try {
    await runWorkflow(incidentId, userId, {
      source,
      description,
      affectedServices,
    });
  } catch (error) {
    console.error(`[Incidents] Workflow failed for ${incidentId}:`, error);
    // Update database with error status
    db.updateIncident(incidentId, { status: "rejected" });
  }
});

/**
 * GET /api/incidents/:id/plan
 * Get execution plan for incident
 */
incidentRouter.get("/:id/plan", authMiddleware, (req: AuthRequest, res: Response) => {
  const incident = incidentStore.get(req.params.id);
  if (!incident) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }
  if (!incident.executionPlan) {
    res.status(404).json({ error: "No execution plan available yet" });
    return;
  }
  res.json(incident.executionPlan);
});

/**
 * POST /api/incidents/:id/approve
 * Approve execution plan
 */
incidentRouter.post("/:id/approve", authMiddleware, async (req: AuthRequest, res: Response) => {
  const incidentId = req.params.id;
  const incident = incidentStore.get(incidentId);

  if (!incident) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  if (incident.status !== "awaiting_approval") {
    res.status(400).json({
      error: `Cannot approve incident in status: ${incident.status}`,
    });
    return;
  }

  // Update status
  incidentStore.update(incidentId, (s) => ({
    ...s,
    status: "executing",
    humanDecision: {
      action: "approved",
      decidedAt: new Date().toISOString(),
      decidedBy: req.user?.email || "api",
    },
  }));

  // Update database
  db.updateIncident(incidentId, {
    status: "executing",
    humanDecision: {
      action: "approved",
      decidedAt: new Date().toISOString(),
      decidedBy: req.user?.email || "api",
    },
  });

  // Broadcast execution started
  broadcastToIncident(incidentId, {
    type: "execution:started",
    incidentId,
    planId: incident.executionPlan?.id || "",
    timestamp: new Date().toISOString(),
  });

  res.json({ status: "executing", message: "Plan approved and executing" });

  // Execute plan asynchronously
  try {
    await executeApprovedPlan(incidentId);
  } catch (error) {
    console.error(`[Incidents] Execution failed for ${incidentId}:`, error);
  }
});

/**
 * POST /api/incidents/:id/reject
 * Reject execution plan - saves feedback to agent memory for learning
 */
incidentRouter.post("/:id/reject", authMiddleware, (req: AuthRequest, res: Response) => {
  const incidentId = req.params.id;
  const userId = req.userId!;
  const incident = incidentStore.get(incidentId);

  if (!incident) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  if (incident.status !== "awaiting_approval") {
    res.status(400).json({
      error: `Cannot reject incident in status: ${incident.status}`,
    });
    return;
  }

  const rejectionReason = req.body.reason || "No reason provided";

  const humanDecision = {
    action: "rejected" as const,
    reason: rejectionReason,
    decidedAt: new Date().toISOString(),
    decidedBy: req.user?.email || "api",
  };

  incidentStore.update(incidentId, (s) => ({
    ...s,
    status: "rejected",
    humanDecision,
  }));

  // Update database
  db.updateIncident(incidentId, {
    status: "rejected",
    humanDecision,
    resolvedAt: new Date().toISOString(),
  });

  // ========== HUMAN FEEDBACK LEARNING ==========
  // Save rejection to agent memory so future incidents learn from this
  if (incident.executionPlan) {
    const actionTypes = incident.executionPlan.actions.map(a => a.type).join(", ");

    db.saveAgentMemory({
      userId,
      incidentId,
      agent: "architect",
      actionType: "rejection_feedback",
      affectedServices: incident.trigger.affectedServices,
      findings: {
        healerFindings: incident.healerFindings,
        sentinelFindings: incident.sentinelFindings,
        correlationVerdict: incident.correlationVerdict,
        executionPlan: incident.executionPlan,
      },
      recommendation: `REJECTED: ${actionTypes}`,
      humanDecision: "rejected",
      blastRadiusScore: incident.severity === "critical" ? 9 : incident.severity === "high" ? 7 : 5,
    });

    console.log(`[Feedback] Saved rejection feedback for ${incidentId}: "${rejectionReason}"`);
  }

  broadcastToIncident(incidentId, {
    type: "incident:resolved",
    incidentId,
    summary: `Plan rejected: ${rejectionReason}`,
    timestamp: new Date().toISOString(),
  });

  res.json({ status: "rejected", message: "Plan rejected and feedback saved for learning" });
});
