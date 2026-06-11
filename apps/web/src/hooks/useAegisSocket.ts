import { useEffect, useRef, useState, useCallback } from "react";
import type { ServerEvent } from "@aegis/shared";
import { incidentApi, API_URL } from "../lib/api";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

/**
 * Hook for SSE-based real-time events + REST API actions
 */
export function useAegisSocket() {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);

  // Connect to SSE stream
  useEffect(() => {
    mountedRef.current = true;

    // Prevent duplicate connections
    if (eventSourceRef.current) {
      return;
    }

    const streamUrl = `${API_URL}/api/events/stream`;
    console.log(`[SSE] Connecting to ${streamUrl}`);
    setStatus("connecting");

    const eventSource = new EventSource(streamUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      if (!mountedRef.current) return;
      console.log("[SSE] Connected");
      setStatus("connected");
    };

    eventSource.onmessage = (e) => {
      if (!mountedRef.current) return;

      try {
        const event = JSON.parse(e.data);

        // Skip connection events
        if (event.type === "connected" || event.type === "subscribed") {
          return;
        }

        setEvents((prev) => [...prev, event as ServerEvent]);
      } catch (error) {
        console.error("[SSE] Failed to parse event:", error);
      }
    };

    eventSource.onerror = () => {
      if (!mountedRef.current) return;
      console.log("[SSE] Connection error, will auto-reconnect...");
      setStatus("error");
    };

    return () => {
      mountedRef.current = false;
      console.log("[SSE] Cleanup - closing connection");
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, []); // Empty deps - only run once on mount

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Submit incident via REST API
  const submitIncident = useCallback(
    async (data: {
      source?: "observability" | "security" | "manual";
      description: string;
      affectedServices: string[];
    }): Promise<{ incidentId: string }> => {
      // Clear previous events when starting new incident
      setEvents([]);

      const result = await incidentApi.create(data.description, data.affectedServices);
      console.log("[API] Incident created:", result.incidentId);
      return result;
    },
    []
  );

  // Approve plan via REST API
  const approvePlan = useCallback(
    async (incidentId: string, _planId: string): Promise<void> => {
      await incidentApi.approve(incidentId);
      console.log("[API] Plan approved");
    },
    []
  );

  // Reject plan via REST API
  const rejectPlan = useCallback(
    async (incidentId: string, _planId: string, reason: string): Promise<void> => {
      await incidentApi.reject(incidentId, reason);
      console.log("[API] Plan rejected");
    },
    []
  );

  return {
    status,
    events,
    clearEvents,
    submitIncident,
    approvePlan,
    rejectPlan,
  };
}
