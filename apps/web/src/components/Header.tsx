import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Moon, Sun, Circle, LogOut, Database, User, Github, Shield, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

interface HeaderProps {
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  isDark: boolean;
  onToggleTheme: () => void;
  onConnectSplunk?: () => void;
  onConnectGitHub?: () => void;
  splunkConnected?: boolean;
  githubConnected?: boolean;
  onAnomalyDetected?: () => void;
}

export function Header({
  connectionStatus,
  isDark,
  onToggleTheme,
  onConnectSplunk,
  onConnectGitHub,
  splunkConnected,
  githubConnected,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const isConnected = connectionStatus === "connected";

  // Auto-monitoring state
  const [autoMonitoring, setAutoMonitoring] = useState(false);
  const [monitoringLoading, setMonitoringLoading] = useState(false);

  // Check monitoring status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await api.get("/api/anomaly/status");
        setAutoMonitoring(res.data.active);
      } catch {
        // Silently fail - not connected yet
      }
    };
    if (splunkConnected) {
      checkStatus();
    }
  }, [splunkConnected]);

  const toggleAutoMonitoring = useCallback(async () => {
    if (!splunkConnected) {
      return;
    }

    setMonitoringLoading(true);
    try {
      if (autoMonitoring) {
        await api.post("/api/anomaly/stop");
        setAutoMonitoring(false);
      } else {
        await api.post("/api/anomaly/start", {
          pollIntervalMs: 30000, // 30 seconds
        });
        setAutoMonitoring(true);
      }
    } catch (error) {
      console.error("Failed to toggle auto-monitoring:", error);
    } finally {
      setMonitoringLoading(false);
    }
  }, [autoMonitoring, splunkConnected]);

  return (
    <header className="sticky top-0 z-50 px-4 sm:px-6 lg:px-8 py-4">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-7xl mx-auto"
      >
        <div className="glass-strong rounded-2xl px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center">
                <Shield className="w-5 h-5 text-background" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-semibold tracking-tight">AegisOps</h1>
                <p className="text-[10px] text-muted-foreground -mt-0.5">Autonomous Ops</p>
              </div>
            </Link>

            {/* Right Section */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Splunk Status */}
              <button
                onClick={onConnectSplunk}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                  splunkConnected
                    ? "glass"
                    : "hover:bg-muted/50 text-muted-foreground"
                )}
              >
                <Database className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {splunkConnected ? "Splunk" : "Connect"}
                </span>
                {splunkConnected && (
                  <span className="w-2 h-2 rounded-full bg-foreground animate-pulse" />
                )}
              </button>

              {/* GitHub Status */}
              <button
                onClick={onConnectGitHub}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                  githubConnected
                    ? "glass"
                    : "hover:bg-muted/50 text-muted-foreground"
                )}
              >
                <Github className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {githubConnected ? "GitHub" : "Connect"}
                </span>
                {githubConnected && (
                  <span className="w-2 h-2 rounded-full bg-foreground animate-pulse" />
                )}
              </button>

              {/* Auto Monitor Toggle */}
              {splunkConnected && (
                <button
                  onClick={toggleAutoMonitoring}
                  disabled={monitoringLoading}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                    autoMonitoring
                      ? "glass bg-foreground/10"
                      : "hover:bg-muted/50 text-muted-foreground"
                  )}
                  title={autoMonitoring ? "Auto-monitoring active - click to stop" : "Click to start auto-monitoring"}
                >
                  <Radar
                    className={cn(
                      "w-4 h-4 transition-all",
                      autoMonitoring && "animate-pulse",
                      monitoringLoading && "opacity-50"
                    )}
                  />
                  <span className="hidden sm:inline">
                    {monitoringLoading ? "..." : autoMonitoring ? "Monitoring" : "Auto"}
                  </span>
                  {autoMonitoring && (
                    <span className="w-2 h-2 rounded-full bg-foreground animate-ping" />
                  )}
                </button>
              )}

              {/* Divider */}
              <div className="w-px h-6 bg-border/50 hidden sm:block" />

              {/* SSE Connection Status */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass">
                <Circle
                  className={cn(
                    "w-2 h-2 fill-current",
                    isConnected ? "text-foreground" : "text-muted-foreground"
                  )}
                />
                <span className="text-xs font-medium">
                  {isConnected ? "Live" : connectionStatus}
                </span>
              </div>

              {/* Theme Toggle */}
              <button
                onClick={onToggleTheme}
                className="p-2.5 rounded-xl hover:bg-muted/50 transition-colors"
                aria-label="Toggle theme"
              >
                {isDark ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>

              {/* User Menu */}
              {user && (
                <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-border/50">
                  <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl glass">
                    <div className="w-6 h-6 rounded-lg bg-foreground/10 flex items-center justify-center">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-sm max-w-[100px] truncate">
                      {user.name || user.email.split("@")[0]}
                    </span>
                  </div>
                  <button
                    onClick={logout}
                    className="p-2.5 rounded-xl hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                    aria-label="Logout"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </header>
  );
}
