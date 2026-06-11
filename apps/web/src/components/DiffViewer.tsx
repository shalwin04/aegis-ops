import { useState } from "react";
import { motion } from "framer-motion";
import { X, GitPullRequest, Code } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface DiffViewerProps {
  filePath: string;
  diff: string;
  originalContent?: string;
  fixedContent?: string;
  description: string;
  onApprove?: () => void;
  onReject?: () => void;
  showActions?: boolean;
  isCreatingPR?: boolean;
}

export function DiffViewer({
  filePath,
  diff,
  originalContent,
  fixedContent,
  description,
  onApprove,
  onReject,
  showActions = true,
  isCreatingPR = false,
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<"diff" | "split">("diff");

  const renderDiffLine = (line: string, index: number) => {
    const isAddition = line.startsWith("+") && !line.startsWith("+++");
    const isDeletion = line.startsWith("-") && !line.startsWith("---");
    const isHeader = line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++");

    return (
      <div
        key={index}
        className={cn(
          "font-mono text-xs px-2 py-0.5 whitespace-pre",
          isAddition && "bg-green-500/20 text-green-400",
          isDeletion && "bg-red-500/20 text-red-400",
          isHeader && "bg-blue-500/10 text-blue-400 font-semibold",
          !isAddition && !isDeletion && !isHeader && "text-muted-foreground"
        )}
      >
        {line}
      </div>
    );
  };

  const renderSplitView = () => {
    const originalLines = originalContent?.split("\n") || [];
    const fixedLines = fixedContent?.split("\n") || [];

    return (
      <div className="grid grid-cols-2 divide-x divide-border">
        {/* Original */}
        <div className="overflow-x-auto">
          <div className="px-2 py-1 bg-red-500/10 text-red-400 text-xs font-semibold border-b border-border">
            Original
          </div>
          <div className="max-h-80 overflow-y-auto">
            {originalLines.map((line, i) => (
              <div
                key={i}
                className="font-mono text-xs px-2 py-0.5 whitespace-pre text-muted-foreground"
              >
                <span className="text-muted-foreground/50 mr-2 select-none">
                  {String(i + 1).padStart(3)}
                </span>
                {line}
              </div>
            ))}
          </div>
        </div>
        {/* Fixed */}
        <div className="overflow-x-auto">
          <div className="px-2 py-1 bg-green-500/10 text-green-400 text-xs font-semibold border-b border-border">
            Fixed
          </div>
          <div className="max-h-80 overflow-y-auto">
            {fixedLines.map((line, i) => (
              <div
                key={i}
                className="font-mono text-xs px-2 py-0.5 whitespace-pre text-muted-foreground"
              >
                <span className="text-muted-foreground/50 mr-2 select-none">
                  {String(i + 1).padStart(3)}
                </span>
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-border rounded-lg overflow-hidden bg-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4" />
          <span className="font-mono text-sm">{filePath}</span>
        </div>
        <div className="flex items-center gap-2">
          {originalContent && fixedContent && (
            <div className="flex items-center bg-muted rounded-md p-0.5">
              <button
                onClick={() => setViewMode("diff")}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  viewMode === "diff"
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Diff
              </button>
              <button
                onClick={() => setViewMode("split")}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors",
                  viewMode === "split"
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Split
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {/* Diff content */}
      <div className="max-h-96 overflow-y-auto">
        {viewMode === "diff" ? (
          <div className="overflow-x-auto">
            {diff.split("\n").map((line, i) => renderDiffLine(line, i))}
          </div>
        ) : (
          renderSplitView()
        )}
      </div>

      {/* Actions */}
      {showActions && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitPullRequest className="w-4 h-4" />
            <span>This will create a pull request for review</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onReject}
              disabled={isCreatingPR}
            >
              <X className="w-3 h-3 mr-1" />
              Skip
            </Button>
            <Button size="sm" onClick={onApprove} disabled={isCreatingPR}>
              {isCreatingPR ? (
                "Creating PR..."
              ) : (
                <>
                  <GitPullRequest className="w-3 h-3 mr-1" />
                  Create PR
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
