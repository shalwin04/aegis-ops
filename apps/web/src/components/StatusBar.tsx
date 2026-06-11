import { motion } from "framer-motion";
import { Activity, Shield, GitMerge, Wrench, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AegisState } from "@aegis/shared";

interface StatusBarProps {
  incident: AegisState | null;
}

const steps = [
  { id: "healer", label: "Healer", shortLabel: "H", icon: Activity },
  { id: "sentinel", label: "Sentinel", shortLabel: "S", icon: Shield },
  { id: "correlator", label: "Correlator", shortLabel: "C", icon: GitMerge },
  { id: "architect", label: "Architect", shortLabel: "A", icon: Wrench },
];

export function StatusBar({ incident }: StatusBarProps) {
  if (!incident) {
    return (
      <div className="h-12 sm:h-16 flex items-center justify-center text-muted-foreground text-xs sm:text-sm">
        Submit an incident to begin analysis
      </div>
    );
  }

  const getStepStatus = (stepId: string) => {
    switch (stepId) {
      case "healer":
        return incident.healerFindings ? "complete" : incident.status === "analyzing" ? "active" : "pending";
      case "sentinel":
        return incident.sentinelFindings ? "complete" : incident.status === "analyzing" ? "active" : "pending";
      case "correlator":
        return incident.correlationVerdict ? "complete" :
          (incident.healerFindings && incident.sentinelFindings) ? "active" : "pending";
      case "architect":
        return incident.executionPlan ? "complete" :
          incident.correlationVerdict ? "active" : "pending";
      default:
        return "pending";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-border rounded-lg p-3 sm:p-4 bg-card"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="text-[10px] sm:text-xs font-mono text-muted-foreground">
            {incident.incidentId}
          </span>
          <span className={cn(
            "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full border",
            incident.severity === "critical" && "border-foreground text-foreground",
            incident.severity === "high" && "border-foreground/60 text-foreground/60",
            incident.severity === "medium" && "border-muted-foreground text-muted-foreground",
            incident.severity === "low" && "border-muted text-muted-foreground"
          )}>
            {incident.severity}
          </span>
        </div>
        <span className="text-[10px] sm:text-xs text-muted-foreground">
          {incident.status.replace("_", " ")}
        </span>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-1 sm:gap-2">
        {steps.map((step, index) => {
          const status = getStepStatus(step.id);
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              <motion.div
                className={cn(
                  "flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md flex-1 transition-colors min-w-0",
                  status === "complete" && "bg-foreground text-background",
                  status === "active" && "bg-accent border border-foreground",
                  status === "pending" && "bg-muted text-muted-foreground"
                )}
                animate={status === "active" ? { opacity: [1, 0.7, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                {status === "complete" ? (
                  <Check className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                ) : (
                  <Icon className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                )}
                {/* Full label on larger screens, short on mobile */}
                <span className="text-[10px] sm:text-xs font-medium truncate hidden xs:inline sm:hidden">
                  {step.shortLabel}
                </span>
                <span className="text-[10px] sm:text-xs font-medium truncate hidden sm:inline">
                  {step.label}
                </span>
              </motion.div>

              {index < steps.length - 1 && (
                <div className={cn(
                  "w-2 sm:w-4 h-px mx-0.5 sm:mx-1 flex-shrink-0",
                  status === "complete" ? "bg-foreground" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
