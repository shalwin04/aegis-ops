import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aegis_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("aegis_token");
      // Redirect to login if not already there
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authApi = {
  signup: async (email: string, password: string, name: string) => {
    const response = await api.post("/auth/signup", { email, password, name });
    return response.data;
  },

  login: async (email: string, password: string) => {
    const response = await api.post("/auth/login", { email, password });
    return response.data;
  },

  me: async () => {
    const response = await api.get("/auth/me");
    return response.data;
  },

  logout: () => {
    localStorage.removeItem("aegis_token");
  },
};

// Splunk connection endpoints
export const splunkApi = {
  connect: async (host: string, port: number, token: string, isSplunkCloud: boolean = true) => {
    const response = await api.post("/splunk/connect", { host, port, token, isSplunkCloud });
    return response.data;
  },

  status: async () => {
    const response = await api.get("/splunk/status");
    return response.data;
  },

  test: async () => {
    const response = await api.post("/splunk/test");
    return response.data;
  },

  disconnect: async () => {
    const response = await api.delete("/splunk/disconnect");
    return response.data;
  },
};

// GitHub connection endpoints
export const githubApi = {
  connect: async (token: string) => {
    const response = await api.post("/api/github/connect", { token });
    return response.data;
  },

  status: async () => {
    const response = await api.get("/api/github/status");
    return response.data;
  },

  disconnect: async () => {
    const response = await api.delete("/api/github/disconnect");
    return response.data;
  },

  repos: async () => {
    const response = await api.get("/api/github/repos");
    return response.data;
  },

  getMappings: async () => {
    const response = await api.get("/api/github/mappings");
    return response.data;
  },

  createMapping: async (serviceName: string, repoOwner: string, repoName: string) => {
    const response = await api.post("/api/github/mappings", {
      serviceName,
      repoOwner,
      repoName,
    });
    return response.data;
  },

  deleteMapping: async (serviceName: string) => {
    const response = await api.delete(`/api/github/mappings/${serviceName}`);
    return response.data;
  },

  previewDiff: async (serviceName: string, filePath: string, fixedContent: string) => {
    const response = await api.post("/api/github/preview-diff", {
      serviceName,
      filePath,
      fixedContent,
    });
    return response.data;
  },

  createPR: async (params: {
    incidentId: string;
    serviceName: string;
    filePath: string;
    fixedContent: string;
    description: string;
    rootCause: string;
  }) => {
    const response = await api.post("/api/github/create-pr", params);
    return response.data;
  },
};

// Incident endpoints
export const incidentApi = {
  list: async () => {
    const response = await api.get("/api/incidents");
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/api/incidents/${id}`);
    return response.data;
  },

  create: async (description: string, affectedServices: string[]) => {
    const response = await api.post("/api/incidents", {
      description,
      affectedServices,
      source: "manual",
    });
    return response.data;
  },

  approve: async (id: string) => {
    const response = await api.post(`/api/incidents/${id}/approve`);
    return response.data;
  },

  reject: async (id: string, reason: string) => {
    const response = await api.post(`/api/incidents/${id}/reject`, { reason });
    return response.data;
  },
};

export { API_URL };
