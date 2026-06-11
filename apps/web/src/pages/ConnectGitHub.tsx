import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Github, Check, Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

interface ServiceMapping {
  id: string;
  serviceName: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
}

interface Repository {
  fullName: string;
  name: string;
  owner: string;
}

export default function ConnectGitHub() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [mappings, setMappings] = useState<ServiceMapping[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);

  // New mapping form
  const [newServiceName, setNewServiceName] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const res = await api.get("/api/github/status");
      if (res.data.connected) {
        setIsConnected(true);
        setUsername(res.data.username);
        loadRepos();
        loadMappings();
      }
    } catch (error) {
      console.error("Failed to check GitHub status:", error);
    }
  };

  const loadRepos = async () => {
    setIsLoadingRepos(true);
    try {
      const res = await api.get("/api/github/repos");
      setRepos(res.data.repos);
    } catch (error) {
      console.error("Failed to load repos:", error);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const loadMappings = async () => {
    try {
      const res = await api.get("/api/github/mappings");
      setMappings(res.data.mappings);
    } catch (error) {
      console.error("Failed to load mappings:", error);
    }
  };

  const handleConnect = async () => {
    if (!token.trim()) {
      toast.error("Please enter a GitHub Personal Access Token");
      return;
    }

    setIsConnecting(true);
    try {
      const res = await api.post("/api/github/connect", { token });
      setIsConnected(true);
      setUsername(res.data.username);
      setToken("");
      toast.success(`Connected as ${res.data.username}`);
      loadRepos();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.delete("/api/github/disconnect");
      setIsConnected(false);
      setUsername(null);
      setRepos([]);
      setMappings([]);
      toast.success("GitHub disconnected");
    } catch (error) {
      toast.error("Failed to disconnect");
    }
  };

  const handleAddMapping = async () => {
    if (!newServiceName.trim() || !selectedRepo) {
      toast.error("Please enter a service name and select a repository");
      return;
    }

    const [owner, name] = selectedRepo.split("/");

    try {
      await api.post("/api/github/mappings", {
        serviceName: newServiceName,
        repoOwner: owner,
        repoName: name,
      });
      toast.success("Mapping added");
      setNewServiceName("");
      setSelectedRepo("");
      loadMappings();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to add mapping");
    }
  };

  const handleDeleteMapping = async (serviceName: string) => {
    try {
      await api.delete(`/api/github/mappings/${serviceName}`);
      toast.success("Mapping deleted");
      loadMappings();
    } catch (error) {
      toast.error("Failed to delete mapping");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="text-center">
            <div className="w-16 h-16 bg-foreground rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Github className="w-8 h-8 text-background" />
            </div>
            <h1 className="text-2xl font-bold">Connect GitHub</h1>
            <p className="text-muted-foreground mt-2">
              Enable AegisOps to create pull requests with automated code fixes
            </p>
          </div>

          {/* Connection Status */}
          {isConnected ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border border-green-500/30 bg-green-500/10 rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-medium">Connected to GitHub</p>
                    <p className="text-sm text-muted-foreground">@{username}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-4">
              <div className="border border-border rounded-lg p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Personal Access Token
                  </label>
                  <Input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={token}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Create a token at{" "}
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:underline"
                    >
                      GitHub Settings <ExternalLink className="w-3 h-3 inline" />
                    </a>
                    {" "}with <code className="bg-muted px-1 rounded">repo</code> scope
                  </p>
                </div>

                <Button
                  onClick={handleConnect}
                  disabled={isConnecting || !token.trim()}
                  className="w-full"
                >
                  {isConnecting ? "Connecting..." : "Connect GitHub"}
                </Button>
              </div>
            </div>
          )}

          {/* Service-Repo Mappings */}
          {isConnected && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="border border-border rounded-lg p-6 space-y-4"
            >
              <div>
                <h2 className="font-semibold">Service-Repository Mappings</h2>
                <p className="text-sm text-muted-foreground">
                  Map your services to repositories for automated code fixes
                </p>
              </div>

              {/* Existing mappings */}
              {mappings.length > 0 && (
                <div className="space-y-2">
                  {mappings.map((mapping) => (
                    <div
                      key={mapping.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium font-mono text-sm">
                          {mapping.serviceName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {mapping.repoOwner}/{mapping.repoName}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMapping(mapping.serviceName)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new mapping */}
              <div className="flex gap-2">
                <Input
                  placeholder="Service name"
                  value={newServiceName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewServiceName(e.target.value)}
                  className="flex-1"
                />
                <select
                  value={selectedRepo}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedRepo(e.target.value)}
                  className="flex-1 bg-muted border border-border rounded-md px-3 text-sm"
                  disabled={isLoadingRepos}
                >
                  <option value="">
                    {isLoadingRepos ? "Loading repos..." : "Select repository"}
                  </option>
                  {repos.map((repo) => (
                    <option key={repo.fullName} value={repo.fullName}>
                      {repo.fullName}
                    </option>
                  ))}
                </select>
                <Button onClick={handleAddMapping} size="icon">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Back button */}
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("/")}>
              Back to Dashboard
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
