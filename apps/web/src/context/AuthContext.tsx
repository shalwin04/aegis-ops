import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { authApi, splunkApi, githubApi } from "../lib/api";

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface SplunkStatus {
  connected: boolean;
  host?: string;
  port?: number;
  isVerified?: boolean;
}

interface GitHubStatus {
  connected: boolean;
  username?: string;
  isVerified?: boolean;
}

interface AuthContextType {
  user: User | null;
  splunkStatus: SplunkStatus | null;
  githubStatus: GitHubStatus | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshSplunkStatus: () => Promise<void>;
  refreshGitHubStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [splunkStatus, setSplunkStatus] = useState<SplunkStatus | null>(null);
  const [githubStatus, setGitHubStatus] = useState<GitHubStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSplunkStatus = useCallback(async () => {
    try {
      const status = await splunkApi.status();
      setSplunkStatus(status);
    } catch {
      setSplunkStatus({ connected: false });
    }
  }, []);

  const refreshGitHubStatus = useCallback(async () => {
    try {
      const status = await githubApi.status();
      setGitHubStatus(status);
    } catch {
      setGitHubStatus({ connected: false });
    }
  }, []);

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem("aegis_token");
    if (token) {
      authApi
        .me()
        .then((data) => {
          setUser(data.user);
          return Promise.all([refreshSplunkStatus(), refreshGitHubStatus()]);
        })
        .catch(() => {
          localStorage.removeItem("aegis_token");
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [refreshSplunkStatus, refreshGitHubStatus]);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    localStorage.setItem("aegis_token", data.token);
    setUser(data.user);
    await Promise.all([refreshSplunkStatus(), refreshGitHubStatus()]);
  };

  const signup = async (email: string, password: string, name: string) => {
    const data = await authApi.signup(email, password, name);
    localStorage.setItem("aegis_token", data.token);
    setUser(data.user);
    setSplunkStatus({ connected: false });
    setGitHubStatus({ connected: false });
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    setSplunkStatus(null);
    setGitHubStatus(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        splunkStatus,
        githubStatus,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        refreshSplunkStatus,
        refreshGitHubStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
