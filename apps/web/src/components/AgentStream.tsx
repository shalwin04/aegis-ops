import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Shield, Wrench, GitMerge, Check, AlertCircle, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "./ui/scroll-area";
import { TypingAnimation } from "./magicui/typing-animation";
import { PulseDot } from "./magicui/pulse-dot";
import type { ServerEvent, AgentName } from "@aegis/shared";

interface AgentStreamProps {
  events: ServerEvent[];
}

const AGENT_CONFIG: Record<AgentName, { icon: typeof Activity; label: string }> = {
  healer: { icon: Activity, label: "Healer" },
  sentinel: { icon: Shield, label: "Sentinel" },
  architect: { icon: Wrench, label: "Architect" },
  correlator: { icon: GitMerge, label: "Correlator" },
};

export function AgentStream({ events }: AgentStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="border border-border rounded-lg bg-card min-h-[500px] h-[calc(100vh-280px)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0 bg-muted/30">
        <h2 className="text-sm font-semibold">Agent Activity</h2>
        {events.length > 0 && (
          <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
            {events.length} events
          </span>
        )}
      </div>

      {/* Stream */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-3">
          {events.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground py-20">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-border flex items-center justify-center mx-auto mb-3">
                  <Activity className="w-5 h-5" />
                </div>
                <p className="text-sm">Waiting for analysis...</p>
                <p className="text-xs text-muted-foreground mt-1">Submit an incident to start</p>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {events.map((event, index) => (
                <EventItem key={index} event={event} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function EventItem({ event }: { event: ServerEvent }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      layout
    >
      {event.type === "agent:thinking" && <ThinkingEvent event={event} />}
      {event.type === "agent:tool_call" && <ToolCallEvent event={event} />}
      {event.type === "agent:tool_result" && <ToolResultEvent event={event} />}
      {event.type === "agent:complete" && <CompleteEvent event={event} />}
      {event.type === "correlation:complete" && <CorrelationEvent event={event} />}
      {event.type === "plan:ready" && <PlanReadyEvent event={event} />}
      {event.type === "execution:started" && <ExecutionStartedEvent event={event} />}
      {event.type === "execution:progress" && <ProgressEvent event={event} />}
      {event.type === "execution:complete" && <ExecutionCompleteEvent event={event} />}
      {event.type === "incident:resolved" && <ResolvedEvent event={event} />}
      {event.type === "error" && <ErrorEvent event={event} />}
    </motion.div>
  );
}

function ThinkingEvent({ event }: { event: Extract<ServerEvent, { type: "agent:thinking" }> }) {
  const config = AGENT_CONFIG[event.agent];
  const Icon = config.icon;

  // Check if this is a memory-related thought
  const isMemoryRelated = event.thought.toLowerCase().includes("memory") ||
    event.thought.toLowerCase().includes("past incident") ||
    event.thought.toLowerCase().includes("similar") ||
    event.thought.toLowerCase().includes("historical");

  return (
    <div className={cn(
      "flex items-start gap-2 sm:gap-3 py-1.5 sm:py-2",
      isMemoryRelated && "bg-primary/5 rounded-md px-2 border-l-2 border-primary"
    )}>
      <div className={cn(
        "w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center flex-shrink-0",
        isMemoryRelated ? "bg-primary/20" : "bg-muted"
      )}>
        {isMemoryRelated ? (
          <Brain className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
        ) : (
          <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
          <span className="text-[10px] sm:text-xs font-medium">{config.label}</span>
          {isMemoryRelated && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-primary/20 text-primary font-medium">
              Memory
            </span>
          )}
          <PulseDot status="active" />
        </div>
        <p className={cn(
          "text-[11px] sm:text-sm break-words",
          isMemoryRelated ? "text-primary/80" : "text-muted-foreground"
        )}>
          <TypingAnimation text={event.thought} duration={20} />
        </p>
      </div>
    </div>
  );
}

function ToolCallEvent({ event }: { event: Extract<ServerEvent, { type: "agent:tool_call" }> }) {
  return (
    <div className="flex items-start gap-3 py-2 pl-2 border-l-2 border-blue-500/50">
      <div className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-500 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold">→</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono font-semibold text-blue-500">{event.tool}</code>
        </div>
        <pre className="text-xs text-muted-foreground font-mono bg-muted rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
          {JSON.stringify(event.params, null, 2).slice(0, 300)}
          {JSON.stringify(event.params).length > 300 && "\n..."}
        </pre>
      </div>
    </div>
  );
}

function ToolResultEvent({ event }: { event: Extract<ServerEvent, { type: "agent:tool_result" }> }) {
  const resultStr = JSON.stringify(event.result, null, 2);

  return (
    <div className="flex items-start gap-3 py-2 pl-2 border-l-2 border-green-500/50">
      <div className={cn(
        "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0",
        event.success ? "bg-green-500/20 text-green-500" : "bg-destructive/20 text-destructive"
      )}>
        {event.success ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-1">
          {event.success ? "Result:" : "Error:"}
        </div>
        <pre className="text-xs text-foreground font-mono bg-muted rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
          {resultStr.slice(0, 500)}
          {resultStr.length > 500 && "\n... (truncated)"}
        </pre>
      </div>
    </div>
  );
}

function CompleteEvent({ event }: { event: Extract<ServerEvent, { type: "agent:complete" }> }) {
  const config = AGENT_CONFIG[event.agent];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 sm:gap-3 py-1.5 sm:py-2 border-l-2 border-foreground pl-2 sm:pl-3">
      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-foreground text-background flex items-center justify-center flex-shrink-0">
        <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
      </div>
      <span className="text-xs sm:text-sm font-medium">{config.label} complete</span>
    </div>
  );
}

function CorrelationEvent({ event }: { event: Extract<ServerEvent, { type: "correlation:complete" }> }) {
  const verdict = event.verdict;

  return (
    <div className="border border-border rounded-md p-2.5 sm:p-3 bg-muted/50">
      <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
        <GitMerge className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        <span className="text-xs sm:text-sm font-medium">Correlation</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-xs">
        <div>
          <span className="text-muted-foreground">Type:</span>{" "}
          <span className="font-mono">{verdict.incidentType}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Confidence:</span>{" "}
          <span className="font-mono">{(verdict.confidenceScore * 100).toFixed(0)}%</span>
        </div>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 sm:mt-2 break-words">{verdict.summary}</p>
    </div>
  );
}

function PlanReadyEvent({ event }: { event: Extract<ServerEvent, { type: "plan:ready" }> }) {
  return (
    <div className="border border-foreground rounded-md p-2.5 sm:p-3">
      <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        <span className="text-xs sm:text-sm font-medium">Plan Ready</span>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground">{event.plan.actions.length} actions proposed</p>
    </div>
  );
}

function ExecutionStartedEvent({ event: _event }: { event: Extract<ServerEvent, { type: "execution:started" }> }) {
  return (
    <motion.div
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      className="border-2 border-blue-500 rounded-md p-3 sm:p-4 bg-blue-500/10"
    >
      <div className="flex items-center gap-2 mb-1">
        <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 animate-pulse" />
        <span className="text-xs sm:text-sm font-medium text-blue-500">Execution Started</span>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground">
        Plan approved. Executing remediation actions...
      </p>
    </motion.div>
  );
}

function ProgressEvent({ event }: { event: Extract<ServerEvent, { type: "execution:progress" }> }) {
  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      waf_rule: "Creating WAF Rule",
      network_isolation: "Isolating Network",
      edge_processor_rule: "Deploying Edge Processor Rule",
      splunk_alert: "Creating Splunk Alert",
      notification: "Sending Notification",
      runbook_trigger: "Triggering Runbook",
      code_patch: "Applying Code Patch",
    };
    return labels[action] || action;
  };

  return (
    <div className={cn(
      "flex items-center gap-2 sm:gap-3 py-2 sm:py-2.5 px-3 rounded-md border-l-2",
      event.status === "running" && "border-l-blue-500 bg-blue-500/5",
      event.status === "completed" && "border-l-green-500 bg-green-500/5",
      event.status === "failed" && "border-l-destructive bg-destructive/5"
    )}>
      <div className={cn(
        "w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center",
        event.status === "running" && "bg-blue-500/20",
        event.status === "completed" && "bg-green-500/20",
        event.status === "failed" && "bg-destructive/20"
      )}>
        {event.status === "running" ? (
          <PulseDot status="active" />
        ) : event.status === "completed" ? (
          <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-500" />
        ) : (
          <AlertCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-destructive" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs sm:text-sm font-medium">
          {getActionLabel(event.action)}
        </p>
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          {event.status === "running" && "In progress..."}
          {event.status === "completed" && "Completed successfully"}
          {event.status === "failed" && "Action failed"}
        </p>
      </div>
    </div>
  );
}

function ExecutionCompleteEvent({ event }: { event: Extract<ServerEvent, { type: "execution:complete" }> }) {
  const results = event.results;

  return (
    <motion.div
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      className={cn(
        "border-2 rounded-md p-3 sm:p-4",
        event.success ? "border-green-500 bg-green-500/10" : "border-destructive bg-destructive/10"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        {event.success ? (
          <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
        ) : (
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
        )}
        <span className={cn(
          "text-xs sm:text-sm font-medium",
          event.success ? "text-green-500" : "text-destructive"
        )}>
          {event.success ? "All Actions Executed Successfully" : "Execution Completed with Errors"}
        </span>
      </div>

      {results?.actionsExecuted && results.actionsExecuted.length > 0 && (
        <div className="text-[10px] sm:text-xs text-muted-foreground">
          <span className="font-medium">Actions completed:</span>{" "}
          {results.actionsExecuted.join(", ")}
        </div>
      )}

      {results?.errors && results.errors.length > 0 && (
        <div className="mt-2 text-[10px] sm:text-xs text-destructive">
          <span className="font-medium">Errors:</span>
          <ul className="list-disc list-inside mt-1">
            {results.errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

function ResolvedEvent({ event }: { event: Extract<ServerEvent, { type: "incident:resolved" }> }) {
  return (
    <motion.div
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      className="border-2 border-foreground rounded-md p-3 sm:p-4 text-center"
    >
      <Check className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2" />
      <p className="text-xs sm:text-sm font-medium">Incident Resolved</p>
      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 break-words">{event.summary}</p>
    </motion.div>
  );
}

function ErrorEvent({ event }: { event: Extract<ServerEvent, { type: "error" }> }) {
  return (
    <div className="border border-destructive rounded-md p-2.5 sm:p-3 bg-destructive/10">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive flex-shrink-0" />
        <span className="text-xs sm:text-sm text-destructive break-words">{event.error}</span>
      </div>
    </div>
  );
}
