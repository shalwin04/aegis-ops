import { useState } from "react";
import { motion } from "framer-motion";
import { X, Check, ArrowRight, Shield, Zap, AlertTriangle, GitPullRequest, Code, Brain, History, Network, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { BorderBeam } from "./magicui/border-beam";
import { DiffViewer } from "./DiffViewer";
import type { ExecutionPlan, Action, CodePatchAction } from "@aegis/shared";

interface ApprovalPanelProps {
  plan: ExecutionPlan;
  onApprove: () => void;
  onReject: (reason: string) => void;
}

export function ApprovalPanel({ plan, onApprove, onReject }: ApprovalPanelProps) {
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const handleReject = () => {
    if (rejectReason.trim()) {
      onReject(rejectReason);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4 lg:p-6"
    >
      <div className="max-w-4xl mx-auto">
        <div className="relative rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          <BorderBeam size={400} duration={8} colorFrom="#fff" colorTo="#888" />

          <div className="p-4 sm:p-5 lg:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-medium mb-0.5 sm:mb-1">Execution Plan</h2>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{plan.title}</p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <span className={cn(
                  "text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border whitespace-nowrap",
                  plan.severity === "critical" && "border-foreground bg-foreground text-background",
                  plan.severity === "high" && "border-foreground",
                  plan.severity === "medium" && "border-muted-foreground text-muted-foreground",
                  plan.severity === "low" && "border-muted text-muted-foreground"
                )}>
                  {plan.severity}
                </span>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-mono">
                  {(plan.confidence.overall * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Memory-backed Confidence Indicator */}
            {(plan.confidence.similarIncidentCount ?? 0) > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 mb-4 p-2.5 rounded-lg bg-muted/50 border border-border"
              >
                <Brain className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">Institutional Memory</span>
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      <History className="w-3 h-3" />
                      {plan.confidence.similarIncidentCount} similar incidents
                    </span>
                    {(plan.confidence.historicalSuccessRate ?? 0) > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">
                        {Math.round((plan.confidence.historicalSuccessRate ?? 0) * 100)}% success rate
                      </span>
                    )}
                  </div>
                  {plan.confidence.reasoning && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                      {plan.confidence.reasoning}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Blast Radius Warning */}
            {plan.projectedImpact.blastRadius && plan.projectedImpact.blastRadius.totalAffected > plan.projectedImpact.servicesAffected.length && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "mb-4 p-2.5 rounded-lg border",
                  plan.projectedImpact.blastRadius.riskScore >= 8
                    ? "bg-destructive/10 border-destructive/30"
                    : plan.projectedImpact.blastRadius.riskScore >= 5
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-muted/50 border-border"
                )}
              >
                <div className="flex items-start gap-2">
                  <Network className={cn(
                    "w-4 h-4 mt-0.5 flex-shrink-0",
                    plan.projectedImpact.blastRadius.riskScore >= 8
                      ? "text-destructive"
                      : plan.projectedImpact.blastRadius.riskScore >= 5
                        ? "text-amber-500"
                        : "text-muted-foreground"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">Blast Radius</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-mono",
                        plan.projectedImpact.blastRadius.riskScore >= 8
                          ? "bg-destructive/20 text-destructive"
                          : plan.projectedImpact.blastRadius.riskScore >= 5
                            ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                            : "bg-muted text-muted-foreground"
                      )}>
                        {plan.projectedImpact.blastRadius.riskScore}/10
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {plan.projectedImpact.blastRadius.totalAffected} services affected
                      </span>
                    </div>

                    {/* Cascade visualization */}
                    {plan.projectedImpact.blastRadius.cascadeAffected.length > 0 && (
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        <span className="font-medium">Cascade:</span>{" "}
                        {plan.projectedImpact.blastRadius.cascadeAffected
                          .slice(0, 4)
                          .map((c, i) => (
                            <span key={i} className={cn(
                              "inline-flex items-center mx-0.5",
                              c.criticality === "critical" && "text-destructive"
                            )}>
                              {c.service}
                              {c.criticality === "critical" && (
                                <AlertOctagon className="w-2.5 h-2.5 ml-0.5" />
                              )}
                              {i < Math.min(plan.projectedImpact.blastRadius!.cascadeAffected.length - 1, 3) && " →"}
                            </span>
                          ))}
                        {plan.projectedImpact.blastRadius.cascadeAffected.length > 4 && (
                          <span> +{plan.projectedImpact.blastRadius.cascadeAffected.length - 4} more</span>
                        )}
                      </div>
                    )}

                    {/* Warnings */}
                    {plan.projectedImpact.blastRadius.warnings.length > 0 && (
                      <div className="mt-1.5 text-[10px] text-destructive">
                        {plan.projectedImpact.blastRadius.warnings[0]}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Summary */}
            <p className="text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6">{plan.summary}</p>

            {/* Actions Grid */}
            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6">
              {plan.actions.slice(0, 6).map((action, index) => (
                <ActionCard key={index} action={action} />
              ))}
              {plan.actions.length > 6 && (
                <div className="flex items-center justify-center text-xs text-muted-foreground">
                  +{plan.actions.length - 6} more
                </div>
              )}
            </div>

            {/* Metrics */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-6 mb-4 sm:mb-6 text-xs sm:text-sm">
              {plan.projectedImpact.estimatedCostSavings && plan.projectedImpact.estimatedCostSavings > 0 && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-muted-foreground">Savings:</span>
                  <span className="font-mono">${plan.projectedImpact.estimatedCostSavings.toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-muted-foreground">Risk:</span>
                <span className={cn(
                  "font-medium",
                  plan.projectedImpact.riskLevel === "high" && "text-foreground",
                  plan.projectedImpact.riskLevel === "medium" && "text-muted-foreground",
                  plan.projectedImpact.riskLevel === "low" && "text-muted-foreground"
                )}>
                  {plan.projectedImpact.riskLevel}
                </span>
              </div>
            </div>

            <Separator className="mb-4 sm:mb-6" />

            {/* Actions */}
            {showReject ? (
              <div className="space-y-2 sm:space-y-3">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  className="w-full bg-muted border border-border rounded-md px-3 py-2 text-xs sm:text-sm resize-none focus:outline-none focus:border-foreground"
                  rows={2}
                  autoFocus
                />
                <div className="flex flex-col xs:flex-row gap-2 sm:gap-3">
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={!rejectReason.trim()}
                    className="flex-1 text-xs sm:text-sm h-9 sm:h-10"
                  >
                    Confirm Rejection
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowReject(false)}
                    className="text-xs sm:text-sm h-9 sm:h-10"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 sm:gap-3">
                <Button
                  onClick={onApprove}
                  className="flex-1 gap-2 text-xs sm:text-sm h-9 sm:h-10"
                >
                  <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Approve & Execute
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowReject(true)}
                  className="h-9 sm:h-10 w-full xs:w-auto"
                >
                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ActionCard({ action }: { action: Action }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getConfig = (type: string) => {
    const configs: Record<string, { icon: typeof Shield; label: string }> = {
      waf_rule: { icon: Shield, label: "WAF Rule" },
      network_isolation: { icon: Shield, label: "Isolation" },
      edge_processor_rule: { icon: Zap, label: "Edge Proc" },
      code_patch: { icon: Code, label: "Code Fix" },
      splunk_alert: { icon: AlertTriangle, label: "Alert" },
      runbook_trigger: { icon: Zap, label: "Runbook" },
      notification: { icon: AlertTriangle, label: "Notify" },
    };
    return configs[type] || { icon: Zap, label: type };
  };

  // Check if this is a code patch action
  const isCodePatch = action.type === "code_patch";
  const codePatchAction = isCodePatch ? (action as CodePatchAction) : null;

  const config = getConfig(action.type);
  const Icon = config.icon;

  const getDescription = () => {
    switch (action.type) {
      case "waf_rule":
        return (action as any).rule?.name;
      case "edge_processor_rule":
        return (action as any).name;
      case "splunk_alert":
        return (action as any).alertConfig?.name;
      case "notification":
        return (action as any).channel;
      case "code_patch":
        return (action as CodePatchAction).file;
      default:
        return action.type;
    }
  };

  const getFullDetails = () => {
    const details: Record<string, unknown> = { type: action.type };

    switch (action.type) {
      case "waf_rule":
        return {
          ...details,
          name: (action as any).rule?.name,
          expression: (action as any).rule?.expression,
          action: (action as any).rule?.action,
        };
      case "network_isolation":
        return {
          ...details,
          targets: (action as any).targets,
          duration: (action as any).duration,
          reason: (action as any).reason,
        };
      case "edge_processor_rule":
        return {
          ...details,
          name: (action as any).name,
          condition: (action as any).condition,
          transformation: (action as any).transformation,
        };
      case "splunk_alert":
        return {
          ...details,
          alertName: (action as any).alertConfig?.name,
          search: (action as any).alertConfig?.search,
          severity: (action as any).alertConfig?.severity,
        };
      case "notification":
        return {
          ...details,
          channel: (action as any).channel,
          recipients: (action as any).recipients,
          message: (action as any).message,
          severity: (action as any).severity,
        };
      case "runbook_trigger":
        return {
          ...details,
          runbookName: (action as any).runbookName,
          runbookId: (action as any).runbookId,
          parameters: (action as any).parameters,
        };
      case "code_patch":
        return {
          ...details,
          file: (action as any).file,
          diff: (action as any).diff,
          repository: (action as any).repository,
          createPR: (action as any).createPR,
        };
      default:
        return action;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "rounded-lg border border-border bg-muted/50 cursor-pointer transition-all hover:border-foreground/30",
        isExpanded && "col-span-full"
      )}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3">
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-background border border-border flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-xs font-medium">{config.label}</p>
          <p className={cn(
            "text-[10px] sm:text-xs text-muted-foreground",
            !isExpanded && "truncate"
          )}>
            {getDescription()}
          </p>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-muted-foreground flex-shrink-0" />
        </motion.div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-3 pb-3 border-t border-border/50"
        >
          {isCodePatch && codePatchAction?.diff ? (
            <div className="mt-2">
              <DiffViewer
                filePath={codePatchAction.file}
                diff={codePatchAction.diff}
                originalContent={codePatchAction.originalContent}
                fixedContent={codePatchAction.fixedContent}
                description={codePatchAction.description}
                showActions={false}
              />
              {codePatchAction.createPR && (
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <GitPullRequest className="w-3 h-3" />
                  <span>Will create a pull request on approval</span>
                </div>
              )}
            </div>
          ) : (
            <pre className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-2 p-2 bg-background rounded-md overflow-x-auto whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {JSON.stringify(getFullDetails(), null, 2)}
            </pre>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
