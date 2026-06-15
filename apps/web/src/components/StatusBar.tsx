import { motion } from "framer-motion";
import { Activity, GitMerge, Wrench, Check, Zap, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AegisState } from "@aegis/shared";

interface StatusBarProps {
  incident: AegisState | null;
}

const steps = [
  { id: "analyze", label: "Analyze", icon: Activity },
  { id: "correlate", label: "Correlate", icon: GitMerge },
  { id: "plan", label: "Plan", icon: Wrench },
  { id: "execute", label: "Execute", icon: Zap },
];

export function StatusBar({ incident }: StatusBarProps) {
  if (!incident) {
    return (
      <div className="glass rounded-2xl p-4 flex items-center justify-center">
        <div className="text-center">
          <Circle className="w-4 h-4 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Submit an incident to begin analysis</p>
        </div>
      </div>
    );
  }

  const getStepStatus = (stepId: string): "pending" | "active" | "complete" => {
    switch (stepId) {
      case "analyze":
        if (incident.healerFindings && incident.sentinelFindings) return "complete";
        if (incident.status === "analyzing") return "active";
        return "pending";
      case "correlate":
        if (incident.correlationVerdict) return "complete";
        if (incident.healerFindings && incident.sentinelFindings) return "active";
        return "pending";
      case "plan":
        if (incident.executionPlan) return "complete";
        if (incident.correlationVerdict) return "active";
        return "pending";
      case "execute":
        if (incident.status === "resolved") return "complete";
        if (incident.status === "executing" || incident.executionPlan) return "active";
        return "pending";
      default:
        return "pending";
    }
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500 text-white";
      case "high":
        return "bg-orange-500 text-white";
      case "medium":
        return "bg-yellow-500 text-black";
      case "low":
        return "bg-foreground/20 text-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "analyzing":
        return "Analyzing...";
      case "awaiting_approval":
        return "Awaiting Approval";
      case "executing":
        return "Executing...";
      case "resolved":
        return "Resolved";
      case "rejected":
        return "Rejected";
      default:
        return status;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong rounded-2xl p-4"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono glass px-2 py-1 rounded-lg">
            {incident.incidentId}
          </span>
          <span className={cn(
            "text-[10px] px-2 py-1 rounded-lg font-semibold uppercase",
            getSeverityStyle(incident.severity)
          )}>
            {incident.severity}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {incident.status === "analyzing" || incident.status === "executing" ? (
            <div className="w-2 h-2 rounded-full bg-foreground animate-pulse" />
          ) : incident.status === "resolved" ? (
            <Check className="w-4 h-4 text-foreground" />
          ) : null}
          <span className="text-xs font-medium">{getStatusLabel(incident.status)}</span>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {steps.map((step, index) => {
          const status = getStepStatus(step.id);
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <motion.div
                className={cn(
                  "flex items-center justify-center gap-2 px-3 py-2 rounded-xl flex-1 transition-all",
                  status === "complete" && "bg-foreground text-background",
                  status === "active" && "glass border-2 border-foreground",
                  status === "pending" && "bg-muted/50 text-muted-foreground"
                )}
                animate={status === "active" ? { opacity: [1, 0.7, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                {status === "complete" ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                <span className="text-xs font-medium hidden sm:inline">{step.label}</span>
              </motion.div>

              {index < steps.length - 1 && (
                <div className={cn(
                  "w-4 h-0.5 mx-1",
                  status === "complete" ? "bg-foreground" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* Incident Description (collapsed) */}
      {incident.trigger?.description && (
        <div className="mt-4 pt-3 border-t border-border/50">
          <p className="text-xs text-muted-foreground line-clamp-2">
            {incident.trigger.description}
          </p>
        </div>
      )}
    </motion.div>
  );
}
