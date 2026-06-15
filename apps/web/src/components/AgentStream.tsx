import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Shield,
  Wrench,
  GitMerge,
  Check,
  AlertCircle,
  Brain,
  ExternalLink,
  GitPullRequest,
  ChevronDown,
  ChevronRight,
  Terminal,
  Zap,
  Bell,
  Database,
  ShieldAlert,
  Code,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServerEvent, AgentName } from "@aegis/shared";

interface AgentStreamProps {
  events: ServerEvent[];
}

const AGENT_CONFIG: Record<AgentName, { icon: typeof Activity; label: string; color: string }> = {
  healer: { icon: Activity, label: "Healer", color: "bg-emerald-500" },
  sentinel: { icon: Shield, label: "Sentinel", color: "bg-amber-500" },
  architect: { icon: Wrench, label: "Architect", color: "bg-violet-500" },
  correlator: { icon: GitMerge, label: "Correlator", color: "bg-sky-500" },
};

// Group events by phase
function groupEventsByPhase(events: ServerEvent[]) {
  const phases: {
    analysis: ServerEvent[];
    correlation: ServerEvent[];
    planning: ServerEvent[];
    execution: ServerEvent[];
    resolution: ServerEvent[];
  } = {
    analysis: [],
    correlation: [],
    planning: [],
    execution: [],
    resolution: [],
  };

  for (const event of events) {
    if (event.type === "agent:thinking" || event.type === "agent:tool_call" || event.type === "agent:tool_result") {
      const agentEvent = event as { agent?: AgentName };
      if (agentEvent.agent === "healer" || agentEvent.agent === "sentinel") {
        phases.analysis.push(event);
      } else if (agentEvent.agent === "correlator") {
        phases.correlation.push(event);
      } else if (agentEvent.agent === "architect") {
        phases.planning.push(event);
      }
    } else if (event.type === "agent:complete") {
      const agentEvent = event as { agent: AgentName };
      if (agentEvent.agent === "healer" || agentEvent.agent === "sentinel") {
        phases.analysis.push(event);
      } else if (agentEvent.agent === "correlator") {
        phases.correlation.push(event);
      } else if (agentEvent.agent === "architect") {
        phases.planning.push(event);
      }
    } else if (event.type === "correlation:complete") {
      phases.correlation.push(event);
    } else if (event.type === "plan:ready") {
      phases.planning.push(event);
    } else if (event.type === "execution:started" || event.type === "execution:progress") {
      phases.execution.push(event);
    } else if (event.type === "execution:complete" || event.type === "incident:resolved") {
      phases.resolution.push(event);
    } else if (event.type === "error") {
      phases.resolution.push(event);
    }
  }

  return phases;
}

export function AgentStream({ events }: AgentStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const phases = groupEventsByPhase(events);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Determine current phase
  const getCurrentPhase = () => {
    if (phases.resolution.length > 0) return "resolution";
    if (phases.execution.length > 0) return "execution";
    if (phases.planning.length > 0) return "planning";
    if (phases.correlation.length > 0) return "correlation";
    if (phases.analysis.length > 0) return "analysis";
    return "waiting";
  };

  const currentPhase = getCurrentPhase();

  // Get the plan from events
  const planEvent = events.find(e => e.type === "plan:ready") as { plan: any } | undefined;

  return (
    <div className="glass-strong rounded-3xl flex flex-col overflow-hidden h-full min-h-0">
      {/* Header with Phase Indicators */}
      <div className="px-4 py-3 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Agent Activity</h2>
              <p className="text-[10px] text-muted-foreground">
                {events.length === 0 ? "Waiting" : `${events.length} events`}
              </p>
            </div>
          </div>
        </div>

        {/* Phase Progress - Compact */}
        {events.length > 0 && (
          <div className="flex items-center gap-1">
            <PhaseIndicator
              label="Analyze"
              active={currentPhase === "analysis"}
              complete={phases.analysis.some(e => e.type === "agent:complete")}
            />
            <div className="w-2 h-px bg-border flex-shrink-0" />
            <PhaseIndicator
              label="Correlate"
              active={currentPhase === "correlation"}
              complete={phases.correlation.some(e => e.type === "correlation:complete")}
            />
            <div className="w-2 h-px bg-border flex-shrink-0" />
            <PhaseIndicator
              label="Plan"
              active={currentPhase === "planning"}
              complete={phases.planning.some(e => e.type === "plan:ready")}
            />
            <div className="w-2 h-px bg-border flex-shrink-0" />
            <PhaseIndicator
              label="Execute"
              active={currentPhase === "execution"}
              complete={currentPhase === "resolution"}
            />
            <div className="w-2 h-px bg-border flex-shrink-0" />
            <PhaseIndicator
              label="Done"
              active={currentPhase === "resolution"}
              complete={phases.resolution.some(e => e.type === "incident:resolved")}
            />
          </div>
        )}
      </div>

      {/* Stream Content - Scrollable */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
        {events.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Analysis Phase */}
            {phases.analysis.length > 0 && (
              <PhaseSection
                title="Analysis"
                subtitle="Healer & Sentinel in parallel"
                events={phases.analysis}
                defaultOpen={currentPhase === "analysis"}
              />
            )}

            {/* Correlation Phase */}
            {phases.correlation.length > 0 && (
              <PhaseSection
                title="Correlation"
                subtitle="Merging findings"
                events={phases.correlation}
                defaultOpen={currentPhase === "correlation"}
              />
            )}

            {/* Planning Phase - Show Architect Output */}
            {phases.planning.length > 0 && (
              <PlanningSection
                events={phases.planning}
                plan={planEvent?.plan}
                defaultOpen={currentPhase === "planning" || currentPhase === "execution"}
              />
            )}

            {/* Execution Phase */}
            {phases.execution.length > 0 && (
              <ExecutionSection events={phases.execution} plan={planEvent?.plan} />
            )}

            {/* Resolution */}
            {phases.resolution.length > 0 && (
              <ResolutionSection events={phases.resolution} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PhaseIndicator({ label, active, complete }: { label: string; active: boolean; complete: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all flex-shrink-0",
      complete && "bg-foreground text-background",
      active && !complete && "bg-foreground/20 text-foreground",
      !active && !complete && "text-muted-foreground"
    )}>
      {complete ? (
        <Check className="w-2.5 h-2.5" />
      ) : active ? (
        <div className="w-1.5 h-1.5 rounded-full bg-foreground animate-pulse" />
      ) : null}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label.charAt(0)}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center text-muted-foreground py-12">
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl glass flex items-center justify-center mx-auto mb-3">
          <Activity className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Waiting for analysis</p>
        <p className="text-xs text-muted-foreground mt-1">Submit an incident to start</p>
      </div>
    </div>
  );
}

function PhaseSection({
  title,
  subtitle,
  events,
  defaultOpen = false,
}: {
  title: string;
  subtitle: string;
  events: ServerEvent[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const thinkingCount = events.filter(e => e.type === "agent:thinking").length;
  const toolCallCount = events.filter(e => e.type === "agent:tool_call").length;

  return (
    <div className="glass rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-foreground/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <div className="text-left">
            <p className="text-xs font-semibold">{title}</p>
            <p className="text-[10px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {thinkingCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/10">
              {thinkingCount}
            </span>
          )}
          {toolCallCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/10">
              <Terminal className="w-2.5 h-2.5 inline mr-0.5" />{toolCallCount}
            </span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/50"
          >
            <div className="p-3 space-y-1.5 max-h-[200px] overflow-y-auto">
              {events.map((event, index) => (
                <EventItem key={index} event={event} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlanningSection({
  plan,
  defaultOpen = false
}: {
  events?: ServerEvent[];
  plan?: any;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="glass rounded-xl overflow-hidden border border-foreground/20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-foreground/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Wrench className="w-4 h-4" />
          <div className="text-left">
            <p className="text-xs font-semibold">Architect Output</p>
            <p className="text-[10px] text-muted-foreground">
              {plan ? `${plan.actions?.length || 0} actions planned` : "Generating..."}
            </p>
          </div>
        </div>
        {plan && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-foreground text-background font-medium">
            {Math.round((plan.confidence?.overall || 0) * 100)}% confidence
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && plan && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/50"
          >
            <div className="p-3 space-y-3 max-h-[300px] overflow-y-auto">
              {/* Summary */}
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Summary</p>
                <p className="text-xs">{plan.summary?.slice(0, 200)}...</p>
              </div>

              {/* Actions */}
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-2">Planned Actions</p>
                <div className="space-y-1.5">
                  {plan.actions?.map((action: any, i: number) => (
                    <ActionPreview key={i} action={action} />
                  ))}
                </div>
              </div>

              {/* Projected Impact */}
              {plan.projectedImpact && (
                <div className="glass rounded-lg p-2">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Projected Impact</p>
                  <div className="flex items-center gap-3 text-[10px]">
                    <div>
                      <span className="text-muted-foreground">Risk: </span>
                      <span className="font-medium">{plan.projectedImpact.riskLevel || "Medium"}</span>
                    </div>
                    {plan.projectedImpact.estimatedSavings && (
                      <div>
                        <span className="text-muted-foreground">Savings: </span>
                        <span className="font-medium">${plan.projectedImpact.estimatedSavings}/mo</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionPreview({ action }: { action: any }) {
  const getActionIcon = (type: string) => {
    switch (type) {
      case "waf_rule": return ShieldAlert;
      case "splunk_alert": return Bell;
      case "notification": return Bell;
      case "code_patch": return Code;
      case "edge_processor_rule": return Database;
      default: return Zap;
    }
  };

  const getActionLabel = (type: string) => {
    const labels: Record<string, string> = {
      waf_rule: "WAF Rule",
      splunk_alert: "Splunk Alert",
      notification: "Notification",
      code_patch: "Code Fix PR",
      edge_processor_rule: "Edge Processor",
      network_isolation: "Network Isolation",
      runbook_trigger: "Runbook",
    };
    return labels[type] || type;
  };

  const Icon = getActionIcon(action.type);

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-foreground/5">
      <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium">{getActionLabel(action.type)}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {action.description || action.rule?.name || action.alertConfig?.name || action.file || ""}
        </p>
      </div>
    </div>
  );
}

function ExecutionSection({ events, plan }: { events: ServerEvent[]; plan?: any }) {
  const progressEvents = events.filter(e => e.type === "execution:progress") as Array<{
    type: "execution:progress";
    action: string;
    status: "running" | "completed" | "failed";
  }>;

  return (
    <div className="glass rounded-xl p-3 border border-foreground/20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center">
          <Zap className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xs font-semibold">Executing</p>
          <p className="text-[10px] text-muted-foreground">
            {progressEvents.filter(e => e.status === "completed").length} / {progressEvents.length} done
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {progressEvents.map((event, i) => (
          <ExecutionAction key={i} action={event.action} status={event.status} plan={plan} />
        ))}
      </div>
    </div>
  );
}

function ExecutionAction({ action, status, plan }: { action: string; status: "running" | "completed" | "failed"; plan?: any }) {
  const getActionDetails = () => {
    const actionData = plan?.actions?.find((a: any) => a.type === action);
    return actionData;
  };

  const actionData = getActionDetails();

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      waf_rule: "WAF Rule",
      network_isolation: "Network Isolation",
      edge_processor_rule: "Edge Processor",
      splunk_alert: "Splunk Alert",
      notification: "Notification",
      runbook_trigger: "Runbook",
      code_patch: "GitHub PR",
    };
    return labels[action] || action;
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case "waf_rule": return ShieldAlert;
      case "splunk_alert": return Bell;
      case "notification": return Bell;
      case "code_patch": return GitPullRequest;
      case "edge_processor_rule": return Database;
      default: return Zap;
    }
  };

  const Icon = getActionIcon(action);

  return (
    <div className={cn(
      "flex items-center gap-2 px-2 py-1.5 rounded-lg",
      status === "completed" && "bg-foreground/5",
      status === "running" && "bg-foreground/10",
      status === "failed" && "bg-destructive/10"
    )}>
      <div className={cn(
        "w-5 h-5 rounded flex items-center justify-center flex-shrink-0",
        status === "completed" && "bg-foreground text-background",
        status === "running" && "bg-foreground/20",
        status === "failed" && "bg-destructive text-white"
      )}>
        {status === "completed" && <Check className="w-3 h-3" />}
        {status === "running" && <div className="w-1.5 h-1.5 rounded-full bg-foreground animate-pulse" />}
        {status === "failed" && <AlertCircle className="w-3 h-3" />}
      </div>
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-medium">{getActionLabel(action)}</p>
        {actionData && (
          <p className="text-[9px] text-muted-foreground truncate">
            {actionData.rule?.name || actionData.alertConfig?.name || actionData.file || ""}
          </p>
        )}
      </div>
      <span className={cn(
        "text-[9px] font-medium flex-shrink-0",
        status === "completed" && "text-foreground",
        status === "running" && "text-muted-foreground",
        status === "failed" && "text-destructive"
      )}>
        {status === "completed" && "Done"}
        {status === "running" && "..."}
        {status === "failed" && "Failed"}
      </span>
    </div>
  );
}

function ResolutionSection({ events }: { events: ServerEvent[] }) {
  const resolvedEvent = events.find(e => e.type === "incident:resolved") as {
    type: "incident:resolved";
    summary: string;
    prsCreated?: string[];
  } | undefined;

  const completeEvent = events.find(e => e.type === "execution:complete") as {
    type: "execution:complete";
    success: boolean;
    results: {
      actionsExecuted: string[];
      errors?: string[];
      prsCreated?: string[];
    };
  } | undefined;

  const errorEvent = events.find(e => e.type === "error");

  if (errorEvent) {
    return (
      <div className="rounded-xl p-3 bg-destructive/10 border border-destructive/30">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <p className="text-xs text-destructive">{(errorEvent as any).error}</p>
        </div>
      </div>
    );
  }

  const prsCreated = resolvedEvent?.prsCreated || completeEvent?.results?.prsCreated || [];

  return (
    <div className="glass-strong rounded-xl p-4 text-center border border-foreground/20">
      <div className="w-10 h-10 rounded-xl bg-foreground text-background flex items-center justify-center mx-auto mb-3">
        <Check className="w-5 h-5" />
      </div>
      <p className="text-sm font-semibold mb-1">Resolved</p>
      <p className="text-[10px] text-muted-foreground mb-3">{resolvedEvent?.summary}</p>

      {/* Actions Summary */}
      {completeEvent?.results?.actionsExecuted && (
        <div className="flex flex-wrap justify-center gap-1 mb-3">
          {completeEvent.results.actionsExecuted.map((action, i) => (
            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/10 font-mono">
              {action}
            </span>
          ))}
        </div>
      )}

      {/* PR Links */}
      {prsCreated.length > 0 && (
        <div className="glass rounded-lg p-2 text-left mt-2">
          <div className="flex items-center gap-1.5 mb-2">
            <GitPullRequest className="w-3 h-3" />
            <span className="text-[10px] font-semibold">Pull Requests</span>
          </div>
          {prsCreated.map((prUrl, i) => (
            <a
              key={i}
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] p-1.5 rounded bg-foreground/5 hover:bg-foreground/10 transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              <span className="font-mono truncate">{prUrl.split("/").slice(-2).join("/")}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function EventItem({ event }: { event: ServerEvent }) {
  if (event.type === "agent:thinking") {
    return <ThinkingEvent event={event} />;
  }
  if (event.type === "agent:tool_call") {
    return <ToolCallEvent event={event} />;
  }
  if (event.type === "agent:tool_result") {
    return <ToolResultEvent event={event} />;
  }
  if (event.type === "agent:complete") {
    return <CompleteEvent event={event} />;
  }
  if (event.type === "correlation:complete") {
    return <CorrelationEvent event={event} />;
  }
  if (event.type === "plan:ready") {
    return null; // Handled by PlanningSection
  }
  return null;
}

function ThinkingEvent({ event }: { event: Extract<ServerEvent, { type: "agent:thinking" }> }) {
  const config = AGENT_CONFIG[event.agent];
  const Icon = config.icon;

  const isMemoryRelated = event.thought.toLowerCase().includes("memory") ||
    event.thought.toLowerCase().includes("past incident") ||
    event.thought.toLowerCase().includes("similar");

  return (
    <div className={cn(
      "flex items-start gap-1.5 py-1 px-1.5 rounded",
      isMemoryRelated && "bg-foreground/5 border-l-2 border-foreground"
    )}>
      <div className={cn("w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5", config.color)}>
        {isMemoryRelated ? (
          <Brain className="w-2.5 h-2.5 text-white" />
        ) : (
          <Icon className="w-2.5 h-2.5 text-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground break-words line-clamp-2">{event.thought}</p>
      </div>
    </div>
  );
}

function ToolCallEvent({ event }: { event: Extract<ServerEvent, { type: "agent:tool_call" }> }) {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1.5 rounded bg-foreground/5">
      <Terminal className="w-3 h-3 text-muted-foreground flex-shrink-0" />
      <code className="text-[9px] font-mono font-medium truncate">{event.tool}</code>
    </div>
  );
}

function ToolResultEvent({ event }: { event: Extract<ServerEvent, { type: "agent:tool_result" }> }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 py-1 px-1.5 rounded",
      event.success ? "bg-foreground/5" : "bg-destructive/10"
    )}>
      {event.success ? (
        <Check className="w-3 h-3 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-3 h-3 text-destructive flex-shrink-0" />
      )}
      <span className="text-[9px] truncate">
        {event.success ? `${event.tool} ✓` : `${event.tool} failed`}
      </span>
    </div>
  );
}

function CompleteEvent({ event }: { event: Extract<ServerEvent, { type: "agent:complete" }> }) {
  const config = AGENT_CONFIG[event.agent];

  return (
    <div className="flex items-center gap-1.5 py-1 px-1.5 rounded bg-foreground text-background">
      <Check className="w-3 h-3 flex-shrink-0" />
      <span className="text-[9px] font-medium">{config.label} done</span>
    </div>
  );
}

function CorrelationEvent({ event }: { event: Extract<ServerEvent, { type: "correlation:complete" }> }) {
  const verdict = event.verdict;

  return (
    <div className="rounded-lg p-2 bg-foreground/5 border border-foreground/10">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold">Verdict</span>
        <span className={cn(
          "text-[9px] px-1.5 py-0.5 rounded-full font-medium",
          verdict.incidentType === "security" && "bg-amber-500/20 text-amber-600",
          verdict.incidentType === "infrastructure" && "bg-sky-500/20 text-sky-600",
          verdict.incidentType === "mixed" && "bg-violet-500/20 text-violet-600"
        )}>
          {verdict.incidentType.toUpperCase()}
        </span>
      </div>
      <p className="text-[9px] text-muted-foreground line-clamp-2">{verdict.summary}</p>
    </div>
  );
}
