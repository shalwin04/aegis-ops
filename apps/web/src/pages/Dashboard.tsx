import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Zap, FileEdit, Radar, Bell } from "lucide-react";
import { toast } from "sonner";
import { useAegisSocket } from "../hooks/useAegisSocket";
import { useAuth } from "../context/AuthContext";
import { Header } from "../components/Header";
import { AgentStream } from "../components/AgentStream";
import { ApprovalPanel } from "../components/ApprovalPanel";
import { IncidentInput } from "../components/IncidentInput";
import { StatusBar } from "../components/StatusBar";
import { ChatPanel } from "../components/ChatPanel";
import { AutoIncidentsPanel } from "../components/AutoIncidentsPanel";
import { cn } from "@/lib/utils";
import type { AegisState, ExecutionPlan, ServerEvent } from "@aegis/shared";

type TabType = "manual" | "auto";

interface AutoIncident {
  id: string;
  timestamp: string;
  anomalies: Array<{
    type: "latency_spike" | "error_surge" | "security_threat" | "auth_attack";
    severity: "low" | "medium" | "high" | "critical";
    description: string;
  }>;
  status: "analyzing" | "awaiting_approval" | "resolved";
  events: ServerEvent[];
}

export default function Dashboard() {
  const [isDark, setIsDark] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("manual");
  const [autoIncidents, setAutoIncidents] = useState<AutoIncident[]>([]);
  const [selectedAutoIncidentId, setSelectedAutoIncidentId] = useState<string | null>(null);
  const [unseenAutoCount, setUnseenAutoCount] = useState(0);
  const { splunkStatus, githubStatus } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const { status, events, clearEvents, submitIncident, approvePlan, rejectPlan } =
    useAegisSocket();

  // Handle auto-detected incidents from events
  useEffect(() => {
    const newAutoIncidents: AutoIncident[] = [];
    const incidentEventsMap = new Map<string, ServerEvent[]>();
    const incidentStatusMap = new Map<string, "analyzing" | "awaiting_approval" | "resolved">();

    for (const event of events) {
      // Track anomaly:detected events
      if (event.type === "anomaly:detected") {
        const anomalyEvent = event as any;
        if (!newAutoIncidents.find((i) => i.id === anomalyEvent.incidentId)) {
          newAutoIncidents.push({
            id: anomalyEvent.incidentId,
            timestamp: anomalyEvent.timestamp,
            anomalies: anomalyEvent.anomalies,
            status: "analyzing",
            events: [],
          });
          incidentEventsMap.set(anomalyEvent.incidentId, []);
          incidentStatusMap.set(anomalyEvent.incidentId, "analyzing");
        }
      }

      // Track events for each incident
      if ("incidentId" in event && event.incidentId?.startsWith("AUTO-")) {
        const existing = incidentEventsMap.get(event.incidentId) || [];
        existing.push(event);
        incidentEventsMap.set(event.incidentId, existing);

        // Update status based on event type
        if (event.type === "plan:ready") {
          incidentStatusMap.set(event.incidentId, "awaiting_approval");
        } else if (event.type === "incident:resolved") {
          incidentStatusMap.set(event.incidentId, "resolved");
        }
      }
    }

    // Merge with existing auto incidents
    setAutoIncidents((prev) => {
      const updated = [...prev];

      for (const newIncident of newAutoIncidents) {
        const existingIndex = updated.findIndex((i) => i.id === newIncident.id);
        if (existingIndex === -1) {
          // New incident - show notification
          const maxSeverity = newIncident.anomalies.reduce(
            (max, a) => {
              const order = ["low", "medium", "high", "critical"];
              return order.indexOf(a.severity) > order.indexOf(max) ? a.severity : max;
            },
            "low" as "low" | "medium" | "high" | "critical"
          );

          toast.warning(
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 font-semibold">
                <Radar className="w-4 h-4" />
                Auto-Detected Incident
              </div>
              <p className="text-xs text-muted-foreground">
                {newIncident.anomalies[0]?.description || "New anomaly detected"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-mono",
                  maxSeverity === "critical" && "bg-red-500/20 text-red-400",
                  maxSeverity === "high" && "bg-orange-500/20 text-orange-400",
                  maxSeverity === "medium" && "bg-yellow-500/20 text-yellow-400",
                  maxSeverity === "low" && "bg-blue-500/20 text-blue-400"
                )}>
                  {maxSeverity.toUpperCase()}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {newIncident.id}
                </span>
              </div>
            </div>,
            {
              duration: 8000,
              action: {
                label: "View",
                onClick: () => {
                  setActiveTab("auto");
                  setSelectedAutoIncidentId(newIncident.id);
                },
              },
            }
          );

          // Increment unseen count if not on auto tab
          if (activeTab !== "auto") {
            setUnseenAutoCount((c) => c + 1);
          }

          updated.push(newIncident);
        }
      }

      // Update events and status for all incidents
      return updated.map((incident) => ({
        ...incident,
        events: incidentEventsMap.get(incident.id) || incident.events,
        status: incidentStatusMap.get(incident.id) || incident.status,
      }));
    });
  }, [events, activeTab]);

  // Clear unseen count when switching to auto tab
  useEffect(() => {
    if (activeTab === "auto") {
      setUnseenAutoCount(0);
    }
  }, [activeTab]);

  // Derive state from events for manual incidents
  const currentIncident = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "state:update") {
        const state = (events[i] as unknown as { state: AegisState }).state;
        // Only return if it's not an auto incident
        if (!state.incidentId.startsWith("AUTO-")) {
          return state;
        }
      }
    }
    return null;
  }, [events]);

  // Get auto incident state from events
  const autoIncidentState = useMemo(() => {
    if (!selectedAutoIncidentId) return null;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "state:update") {
        const state = (events[i] as unknown as { state: AegisState }).state;
        if (state.incidentId === selectedAutoIncidentId) {
          return state;
        }
      }
    }
    return null;
  }, [events, selectedAutoIncidentId]);

  // Get auto incident events
  const autoIncidentEvents = useMemo(() => {
    if (!selectedAutoIncidentId) return [];
    return events.filter(
      (e) => "incidentId" in e && e.incidentId === selectedAutoIncidentId
    );
  }, [events, selectedAutoIncidentId]);

  const pendingPlan = useMemo(() => {
    let plan: ExecutionPlan | null = null;
    const relevantEvents = activeTab === "auto" ? autoIncidentEvents : events;

    for (const event of relevantEvents) {
      if (event.type === "plan:ready") {
        plan = (event as unknown as { plan: ExecutionPlan }).plan;
      } else if (
        event.type === "execution:started" ||
        event.type === "execution:complete" ||
        event.type === "incident:resolved"
      ) {
        plan = null;
      }
    }
    return plan;
  }, [events, autoIncidentEvents, activeTab]);

  const handleSubmitIncident = async (data: {
    description: string;
    affectedServices: string[];
  }) => {
    clearEvents();
    try {
      await submitIncident({
        description: data.description,
        affectedServices: data.affectedServices,
      });
    } catch (error) {
      console.error("Failed to submit incident:", error);
    }
  };

  const handleApprove = async () => {
    const incident = activeTab === "auto" ? autoIncidentState : currentIncident;
    if (pendingPlan && incident) {
      try {
        await approvePlan(incident.incidentId, pendingPlan.id);
      } catch (error) {
        console.error("Failed to approve plan:", error);
      }
    }
  };

  const handleReject = async (reason: string) => {
    const incident = activeTab === "auto" ? autoIncidentState : currentIncident;
    if (pendingPlan && incident) {
      try {
        await rejectPlan(incident.incidentId, pendingPlan.id, reason);
      } catch (error) {
        console.error("Failed to reject plan:", error);
      }
    }
  };

  const handleSelectAutoIncident = useCallback((id: string) => {
    setSelectedAutoIncidentId(id);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-radial pointer-events-none" />

      {/* Floating orbs */}
      <div className="orb w-[500px] h-[500px] -top-40 -left-40" />
      <div className="orb-accent w-[400px] h-[400px] top-1/2 -right-32" />

      {/* Noise texture */}
      <div className="fixed inset-0 noise pointer-events-none" />

      {/* Header - Fixed height */}
      <Header
        connectionStatus={status}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        onConnectSplunk={() => navigate("/connect-splunk")}
        onConnectGitHub={() => navigate("/connect-github")}
        splunkConnected={splunkStatus?.connected}
        githubConnected={githubStatus?.connected}
      />

      {/* Main Content - Flex grow */}
      <main className="flex-1 relative overflow-hidden">
        <div className="h-full w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col">
          {/* Connection Banner */}
          {!splunkStatus?.connected && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 glass rounded-xl p-3 flex items-center justify-between flex-shrink-0"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <div>
                  <p className="text-xs font-medium">Demo Mode</p>
                  <p className="text-[10px] text-muted-foreground">Connect Splunk for real data</p>
                </div>
              </div>
              <button
                onClick={() => navigate("/connect-splunk")}
                className="px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium hover:bg-foreground/90 transition-colors flex items-center gap-1.5"
              >
                <Zap className="w-3 h-3" />
                Connect
              </button>
            </motion.div>
          )}

          {/* Tab Navigation */}
          <div className="flex-shrink-0 mb-4">
            <div className="flex items-center gap-2">
              <div className="flex gap-1 p-1 rounded-xl glass">
                <button
                  onClick={() => setActiveTab("manual")}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === "manual"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileEdit className="w-4 h-4" />
                  Manual Analysis
                </button>
                <button
                  onClick={() => setActiveTab("auto")}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative",
                    activeTab === "auto"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Radar className="w-4 h-4" />
                  Auto Incidents
                  {unseenAutoCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
                    >
                      {unseenAutoCount > 9 ? "9+" : unseenAutoCount}
                    </motion.span>
                  )}
                </button>
              </div>

              {/* Quick Stats */}
              {autoIncidents.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-lg glass text-xs"
                >
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Bell className="w-3.5 h-3.5" />
                    {autoIncidents.filter((i) => i.status !== "resolved").length} active
                  </span>
                  <div className="w-px h-4 bg-border/50" />
                  <span className="text-muted-foreground">
                    {autoIncidents.length} total detected
                  </span>
                </motion.div>
              )}
            </div>
          </div>

          {/* Status Bar */}
          <div className="flex-shrink-0 mb-4">
            <StatusBar incident={activeTab === "auto" ? autoIncidentState : currentIncident} />
          </div>

          {/* Main Grid - Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === "manual" ? (
              <motion.div
                key="manual"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-hidden"
              >
                {/* Left Panel - Input */}
                <div className="lg:col-span-4 xl:col-span-3 flex flex-col min-h-0">
                  <IncidentInput
                    onSubmit={handleSubmitIncident}
                    disabled={status !== "connected"}
                  />
                </div>

                {/* Right Panel - Agent Stream */}
                <div className="lg:col-span-8 xl:col-span-9 flex flex-col min-h-0 overflow-hidden">
                  <AgentStream events={events} />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="auto"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-hidden"
              >
                {/* Left Panel - Auto Incidents List */}
                <div className="lg:col-span-4 xl:col-span-3 flex flex-col min-h-0">
                  <AutoIncidentsPanel
                    autoIncidents={autoIncidents}
                    selectedIncidentId={selectedAutoIncidentId}
                    onSelectIncident={handleSelectAutoIncident}
                  />
                </div>

                {/* Right Panel - Agent Stream for Selected Incident */}
                <div className="lg:col-span-8 xl:col-span-9 flex flex-col min-h-0 overflow-hidden">
                  {selectedAutoIncidentId ? (
                    <AgentStream events={autoIncidentEvents} />
                  ) : (
                    <div className="h-full glass rounded-2xl flex flex-col items-center justify-center text-center p-8">
                      <div className="w-20 h-20 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                        <Radar className="w-10 h-10 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">Auto-Detection Active</h3>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        When anomalies are detected, they will appear in the list on the left.
                        Select an incident to view its analysis progress.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Approval Panel - Overlay */}
      <AnimatePresence>
        {pendingPlan && (
          <ApprovalPanel
            plan={pendingPlan}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <ChatPanel />
    </div>
  );
}
