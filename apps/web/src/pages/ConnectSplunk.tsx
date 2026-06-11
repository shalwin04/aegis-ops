import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Shield,
  Server,
  Key,
  AlertCircle,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { splunkApi } from "../lib/api";
import { Button } from "../components/ui/button";

export default function ConnectSplunk() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("443");
  const [token, setToken] = useState("");
  const [isSplunkCloud, setIsSplunkCloud] = useState(true);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const { refreshSplunkStatus, splunkStatus } = useAuth();
  const navigate = useNavigate();

  const handleTest = async () => {
    setError("");
    setTestSuccess(false);
    setIsTesting(true);

    try {
      await splunkApi.connect(host, parseInt(port), token, isSplunkCloud);
      setTestSuccess(true);
      await refreshSplunkStatus();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; details?: string; technicalError?: string } } };
      const errorMsg = error.response?.data?.error || "Connection failed";
      const details = error.response?.data?.details || "";
      const technical = error.response?.data?.technicalError || "";
      setError(`${errorMsg}${details ? ` - ${details}` : ""}${technical ? ` (${technical})` : ""}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await splunkApi.connect(host, parseInt(port), token, isSplunkCloud);
      await refreshSplunkStatus();
      navigate("/");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; details?: string; technicalError?: string } } };
      const errorMsg = error.response?.data?.error || "Connection failed";
      const details = error.response?.data?.details || "";
      const technical = error.response?.data?.technicalError || "";
      setError(`${errorMsg}${details ? ` - ${details}` : ""}${technical ? ` (${technical})` : ""}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="h-10 w-10 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">AegisOps</h1>
          </div>
          <p className="text-muted-foreground">
            Connect your Splunk instance to enable real-time analysis
          </p>
        </div>

        <div className="bg-card border rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-2">Connect to Splunk</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Enter your Splunk connection details. Requires the{" "}
            <a
              href="https://splunkbase.splunk.com/app/7671"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              MCP Server for Splunk
            </a>{" "}
            app installed on your instance.
          </p>

          {/* Splunk Type Toggle */}
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-md mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="splunkType"
                checked={isSplunkCloud}
                onChange={() => {
                  setIsSplunkCloud(true);
                  setPort("443");
                }}
                className="w-4 h-4 text-primary"
              />
              <span className="text-sm font-medium">Splunk Cloud</span>
              <span className="text-xs text-muted-foreground">(port 443)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="splunkType"
                checked={!isSplunkCloud}
                onChange={() => {
                  setIsSplunkCloud(false);
                  setPort("8089");
                }}
                className="w-4 h-4 text-primary"
              />
              <span className="text-sm font-medium">Splunk Enterprise</span>
              <span className="text-xs text-muted-foreground">(port 8089)</span>
            </label>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 p-3 mb-4 text-sm text-destructive bg-destructive/10 rounded-md"
            >
              <AlertCircle className="h-4 w-4" />
              {error}
            </motion.div>
          )}

          {testSuccess && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 p-3 mb-4 text-sm text-green-600 bg-green-500/10 rounded-md"
            >
              <CheckCircle className="h-4 w-4" />
              Connection successful! Click "Connect" to save.
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1.5">
                  Splunk Host
                </label>
                <div className="relative">
                  <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="splunk.company.com"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full px-4 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="8089"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                API Token
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="••••••••••••••••"
                  required
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a token with "mcp" audience tag for MCP Server access
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={!host || !token || isTesting}
                className="flex-1"
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !host || !token}
                className="flex-1"
              >
                {isLoading ? "Connecting..." : "Connect"}
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t">
            <div className="flex items-center justify-between text-sm">
              <button
                onClick={handleSkip}
                className="text-muted-foreground hover:text-foreground"
              >
                Skip for now (use demo mode)
              </button>
              <a
                href="https://docs.splunk.com/Documentation/Splunk/latest/Security/UseAuthTokens"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                Help: Getting a token
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        {splunkStatus?.connected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg"
          >
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Connected to {splunkStatus.host}</span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
