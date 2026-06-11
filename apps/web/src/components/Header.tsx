import { motion } from "framer-motion";
import { Moon, Sun, Circle, LogOut, Database, User, Github } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "../context/AuthContext";

interface HeaderProps {
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  isDark: boolean;
  onToggleTheme: () => void;
  onConnectSplunk?: () => void;
  onConnectGitHub?: () => void;
  splunkConnected?: boolean;
  githubConnected?: boolean;
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

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <motion.div
            className="flex items-center gap-2 sm:gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="relative">
              <svg
                width="28"
                height="28"
                viewBox="0 0 32 32"
                fill="none"
                className="text-foreground sm:w-8 sm:h-8"
              >
                <path
                  d="M16 2L28 8V16C28 22.627 22.627 28 16 30C9.373 28 4 22.627 4 16V8L16 2Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
                <circle cx="16" cy="14" r="4" fill="currentColor" />
              </svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-medium tracking-tight">
                AegisOps
              </h1>
            </div>
          </motion.div>

          {/* Right Section */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Splunk Status */}
            <button
              onClick={onConnectSplunk}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs sm:text-sm transition-colors",
                splunkConnected
                  ? "text-green-600 bg-green-500/10 hover:bg-green-500/20"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <Database className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {splunkConnected ? "Splunk" : "Connect Splunk"}
              </span>
            </button>

            {/* GitHub Status */}
            <button
              onClick={onConnectGitHub}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs sm:text-sm transition-colors",
                githubConnected
                  ? "text-green-600 bg-green-500/10 hover:bg-green-500/20"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <Github className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {githubConnected ? "GitHub" : "Connect GitHub"}
              </span>
            </button>

            {/* SSE Connection Status */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
              <Circle
                className={cn(
                  "w-1.5 h-1.5 sm:w-2 sm:h-2 fill-current",
                  isConnected ? "text-green-500" : "text-muted-foreground"
                )}
              />
              <span className="text-muted-foreground hidden sm:inline">
                {isConnected ? "Live" : connectionStatus}
              </span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={onToggleTheme}
              className="p-1.5 sm:p-2 rounded-md hover:bg-accent transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? (
                <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </button>

            {/* User Menu */}
            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-border">
                <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span className="max-w-[100px] truncate">{user.name || user.email}</span>
                </div>
                <button
                  onClick={logout}
                  className="p-1.5 sm:p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
