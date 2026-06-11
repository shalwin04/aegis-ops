import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAegisSocket } from "../hooks/useAegisSocket";
import { useAuth } from "../context/AuthContext";
import { Header } from "../components/Header";
import { AgentStream } from "../components/AgentStream";
import { ApprovalPanel } from "../components/ApprovalPanel";
import { IncidentInput } from "../components/IncidentInput";
import { StatusBar } from "../components/StatusBar";
import { ChatPanel } from "../components/ChatPanel";
import type { AegisState, ExecutionPlan } from "@aegis/shared";

export default function Dashboard() {
  const [isDark, setIsDark] = useState(true);
  const { splunkStatus, githubStatus } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const { status, events, clearEvents, submitIncident, approvePlan, rejectPlan } =
    useAegisSocket();

  // Derive state from events
  const currentIncident = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "state:update") {
        return (events[i] as unknown as { state: AegisState }).state;
      }
    }
    return null;
  }, [events]);

  const pendingPlan = useMemo(() => {
    let plan: ExecutionPlan | null = null;
    for (const event of events) {
      if (event.type === "plan:ready") {
        plan = (event as unknown as { plan: ExecutionPlan }).plan;
      } else if (
        event.type === "execution:started" ||
        event.type === "execution:complete" ||
        event.type === "incident:resolved"
      ) {
        // Clear the approval panel as soon as execution starts
        plan = null;
      }
    }
    return plan;
  }, [events]);

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
    if (pendingPlan && currentIncident) {
      try {
        await approvePlan(currentIncident.incidentId, pendingPlan.id);
      } catch (error) {
        console.error("Failed to approve plan:", error);
      }
    }
  };

  const handleReject = async (reason: string) => {
    if (pendingPlan && currentIncident) {
      try {
        await rejectPlan(currentIncident.incidentId, pendingPlan.id, reason);
      } catch (error) {
        console.error("Failed to reject plan:", error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle grid background */}
      <div className="fixed inset-0 bg-dots opacity-50 pointer-events-none" />

      <Header
        connectionStatus={status}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        onConnectSplunk={() => navigate("/connect-splunk")}
        onConnectGitHub={() => navigate("/connect-github")}
        splunkConnected={splunkStatus?.connected}
        githubConnected={githubStatus?.connected}
      />

      <main className="relative pb-8">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          {/* Splunk Connection Banner */}
          {!splunkStatus?.connected && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between"
            >
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Running in demo mode. Connect your Splunk instance for real analysis.
              </p>
              <button
                onClick={() => navigate("/connect-splunk")}
                className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:underline"
              >
                Connect Splunk
              </button>
            </motion.div>
          )}

          {/* Status Bar */}
          <StatusBar incident={currentIncident} />

          {/* Main Grid - Side by side layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
            {/* Input Panel - Left sidebar */}
            <motion.div
              className="lg:col-span-4 xl:col-span-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="lg:sticky lg:top-24">
                <IncidentInput
                  onSubmit={handleSubmitIncident}
                  disabled={status !== "connected"}
                />
              </div>
            </motion.div>

            {/* Agent Stream - Main content area */}
            <motion.div
              className="lg:col-span-8 xl:col-span-9"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <AgentStream events={events} />
            </motion.div>
          </div>

          {/* Approval Panel - Full Width Overlay */}
          <AnimatePresence>
            {pendingPlan && (
              <ApprovalPanel
                plan={pendingPlan}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Agentic Chatbot */}
      <ChatPanel />
    </div>
  );
}
