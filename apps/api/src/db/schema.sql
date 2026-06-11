-- AegisOps Database Schema
-- SQLite with better-sqlite3

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Splunk connections (encrypted credentials)
CREATE TABLE IF NOT EXISTS splunk_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 443,
  token_encrypted TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  is_splunk_cloud INTEGER DEFAULT 1,
  is_verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Incidents (multi-tenant)
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_services TEXT NOT NULL,
  severity TEXT,
  status TEXT DEFAULT 'analyzing',
  healer_findings TEXT,
  sentinel_findings TEXT,
  correlation_verdict TEXT,
  execution_plan TEXT,
  execution_results TEXT,
  human_decision TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Agent memory (for learning across incidents)
CREATE TABLE IF NOT EXISTS agent_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  action_type TEXT NOT NULL,
  affected_services TEXT NOT NULL,
  findings TEXT NOT NULL,
  recommendation TEXT,
  human_decision TEXT,
  rejection_reason TEXT,
  blast_radius_score INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

-- Service dependencies (for blast radius prediction)
CREATE TABLE IF NOT EXISTS service_dependencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  depends_on TEXT NOT NULL,
  dependency_type TEXT DEFAULT 'runtime',
  criticality TEXT DEFAULT 'medium',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, service_name, depends_on)
);

-- Integration configurations (Slack, PagerDuty, etc.)
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  config_encrypted TEXT NOT NULL,
  config_iv TEXT NOT NULL,
  config_tag TEXT NOT NULL,
  is_verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, type)
);

-- Sessions for refresh tokens
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- GitHub connections (encrypted PAT)
CREATE TABLE IF NOT EXISTS github_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  token_encrypted TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  username TEXT,
  is_verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Service to repository mappings
CREATE TABLE IF NOT EXISTS service_repo_mappings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  default_branch TEXT DEFAULT 'main',
  path_patterns TEXT DEFAULT '["**/*"]',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, service_name)
);

-- Track PRs created by AegisOps
CREATE TABLE IF NOT EXISTS aegis_pull_requests (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  files_changed TEXT NOT NULL,
  human_feedback TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_incidents_user ON incidents(user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_agent_memory_user ON agent_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_incident ON agent_memory(incident_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_decision ON agent_memory(human_decision);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_service_mappings_user ON service_repo_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_aegis_prs_incident ON aegis_pull_requests(incident_id);
CREATE INDEX IF NOT EXISTS idx_aegis_prs_user ON aegis_pull_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_service_deps_user ON service_dependencies(user_id);
CREATE INDEX IF NOT EXISTS idx_service_deps_service ON service_dependencies(service_name);
CREATE INDEX IF NOT EXISTS idx_integrations_user ON integrations(user_id);
