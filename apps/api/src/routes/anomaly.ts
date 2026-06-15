/**
 * Anomaly Detection Routes
 *
 * Enable/disable automatic anomaly detection that monitors Splunk
 * and triggers incidents automatically.
 */

import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import {
  startAnomalyDetection,
  stopAnomalyDetection,
  getDetectorStatus,
  clearRecentIncidents,
} from "../services/anomaly-detector.js";

export const anomalyRouter = Router();
anomalyRouter.use(authMiddleware);

/**
 * GET /api/anomaly/status
 * Get anomaly detection status
 */
anomalyRouter.get("/status", (req: AuthRequest, res: Response) => {
  const status = getDetectorStatus(req.userId!);
  res.json(status);
});

/**
 * POST /api/anomaly/start
 * Start anomaly detection
 */
anomalyRouter.post("/start", (req: AuthRequest, res: Response) => {
  const { pollIntervalMs, thresholds } = req.body;

  startAnomalyDetection(req.userId!, {
    enabled: true,
    pollIntervalMs: pollIntervalMs || 30000,
    thresholds: thresholds || undefined,
  });

  res.json({
    success: true,
    message: "Anomaly detection started",
    status: getDetectorStatus(req.userId!),
  });
});

/**
 * POST /api/anomaly/stop
 * Stop anomaly detection
 */
anomalyRouter.post("/stop", (req: AuthRequest, res: Response) => {
  stopAnomalyDetection(req.userId!);

  res.json({
    success: true,
    message: "Anomaly detection stopped",
  });
});

/**
 * POST /api/anomaly/clear-cache
 * Clear recent incidents cache (for testing)
 */
anomalyRouter.post("/clear-cache", (_req: AuthRequest, res: Response) => {
  clearRecentIncidents();
  res.json({ success: true, message: "Cache cleared" });
});
