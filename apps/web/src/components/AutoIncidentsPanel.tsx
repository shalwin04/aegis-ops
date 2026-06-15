import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radar,
  Shield,
  Clock,
  ChevronRight,
  Activity,
  ShieldAlert,
  ServerCrash,
  KeyRound,
  CheckCircle2,
  Circle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServerEvent } from "@aegis/shared";

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

interface AutoIncidentsPanelProps {
  autoIncidents: AutoIncident[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
}

const anomalyIcons = {
  latency_spike: Activity,
  error_surge: ServerCrash,
  security_threat: ShieldAlert,
  auth_attack: KeyRound,
};

const severityColors = {
  low: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
};

const statusConfig = {
  analyzing: {
    icon: Activity,
    label: "Analyzing",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  awaiting_approval: {
    icon: Clock,
    label: "Awaiting Approval",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
  resolved: {
    icon: CheckCircle2,
    label: "Resolved",
    color: "text-green-400",
    bg: "bg-green-500/10",
  },
};

export function AutoIncidentsPanel({
  autoIncidents,
  selectedIncidentId,
  onSelectIncident,
}: AutoIncidentsPanelProps) {
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");

  const filteredIncidents = autoIncidents.filter((incident) => {
    if (filter === "all") return true;
    if (filter === "active") return incident.status !== "resolved";
    return incident.status === "resolved";
  });

  const activeCount = autoIncidents.filter((i) => i.status !== "resolved").length;

  return (
    <div className="h-full flex flex-col glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center">
              <Radar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Auto-Detected Incidents</h2>
              <p className="text-[10px] text-muted-foreground">
                Autonomous monitoring & analysis
              </p>
            </div>
          </div>
          {activeCount > 0 && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">
              {activeCount} Active
            </span>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-muted/30">
          {(["all", "active", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                filter === f
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Incidents List */}
      <div className="flex-1 overflow-y-auto p-2">
        <AnimatePresence mode="popLayout">
          {filteredIncidents.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center p-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">
                No {filter !== "all" ? filter : ""} incidents
              </p>
              <p className="text-xs text-muted-foreground/70">
                Auto-detection is monitoring your systems
              </p>
            </motion.div>
          ) : (
            <div className="space-y-2">
              {filteredIncidents.map((incident, index) => {
                const isSelected = selectedIncidentId === incident.id;
                const maxSeverity = incident.anomalies.reduce(
                  (max, a) => {
                    const order = ["low", "medium", "high", "critical"];
                    return order.indexOf(a.severity) > order.indexOf(max)
                      ? a.severity
                      : max;
                  },
                  "low" as "low" | "medium" | "high" | "critical"
                );
                const StatusIcon = statusConfig[incident.status].icon;

                return (
                  <motion.div
                    key={incident.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <button
                      onClick={() => onSelectIncident(incident.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-xl transition-all",
                        isSelected
                          ? "bg-foreground/10 ring-1 ring-foreground/20"
                          : "hover:bg-muted/30"
                      )}
                    >
                      {/* Header Row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border",
                              severityColors[maxSeverity]
                            )}
                          >
                            {incident.id}
                          </span>
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1",
                              statusConfig[incident.status].bg,
                              statusConfig[incident.status].color
                            )}
                          >
                            <StatusIcon className="w-2.5 h-2.5" />
                            {statusConfig[incident.status].label}
                          </span>
                        </div>
                        <ChevronRight
                          className={cn(
                            "w-4 h-4 text-muted-foreground transition-transform",
                            isSelected && "rotate-90"
                          )}
                        />
                      </div>

                      {/* Anomalies */}
                      <div className="space-y-1.5">
                        {incident.anomalies.map((anomaly, i) => {
                          const AnomalyIcon = anomalyIcons[anomaly.type];
                          return (
                            <div
                              key={i}
                              className="flex items-start gap-2 text-xs"
                            >
                              <AnomalyIcon
                                className={cn(
                                  "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
                                  severityColors[anomaly.severity].split(" ")[0]
                                )}
                              />
                              <span className="text-muted-foreground line-clamp-1">
                                {anomaly.description}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(incident.timestamp).toLocaleTimeString()}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] text-foreground flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            Viewing
                          </span>
                        )}
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Stats */}
      <div className="p-3 border-t border-border/50">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Circle className="w-2 h-2 fill-green-500 text-green-500 animate-pulse" />
            Auto-monitoring active
          </span>
          <span>
            {autoIncidents.length} total incident{autoIncidents.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
