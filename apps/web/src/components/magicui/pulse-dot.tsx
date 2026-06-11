import { cn } from "@/lib/utils";

interface PulseDotProps {
  className?: string;
  status?: "active" | "inactive" | "warning" | "error";
}

export function PulseDot({ className, status = "active" }: PulseDotProps) {
  const statusColors = {
    active: "bg-foreground",
    inactive: "bg-muted-foreground",
    warning: "bg-muted-foreground",
    error: "bg-destructive",
  };

  return (
    <span className={cn("relative flex h-2 w-2", className)}>
      {status === "active" && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            statusColors[status]
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          statusColors[status]
        )}
      />
    </span>
  );
}
