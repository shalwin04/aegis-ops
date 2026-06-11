import React from "react";
import { cn } from "@/lib/utils";

export interface ShimmerButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
}

export const ShimmerButton = React.forwardRef<
  HTMLButtonElement,
  ShimmerButtonProps
>(
  (
    {
      shimmerColor = "hsl(var(--foreground))",
      shimmerSize = "0.1em",
      shimmerDuration = "2s",
      borderRadius = "0.5rem",
      background = "hsl(var(--background))",
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        style={
          {
            "--shimmer-color": shimmerColor,
            "--radius": borderRadius,
            "--speed": shimmerDuration,
            "--cut": shimmerSize,
            "--bg": background,
          } as React.CSSProperties
        }
        className={cn(
          "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap border border-border px-6 py-3 text-foreground transition-all duration-300",
          "[border-radius:var(--radius)]",
          "hover:border-foreground/50",
          "disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        {...props}
      >
        {/* Shimmer effect */}
        <div
          className={cn(
            "absolute inset-0 overflow-hidden",
            "[border-radius:var(--radius)]"
          )}
        >
          <div className="absolute inset-[-100%] animate-shimmer [background:linear-gradient(90deg,transparent,var(--shimmer-color),transparent)] opacity-0 group-hover:opacity-10" />
        </div>

        {/* Content */}
        <span className="relative z-10 flex items-center gap-2 text-sm font-medium">
          {children}
        </span>
      </button>
    );
  }
);

ShimmerButton.displayName = "ShimmerButton";
