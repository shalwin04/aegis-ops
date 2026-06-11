import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { AegisState } from "@aegis/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Type definitions
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SplunkConnection {
  id: string;
  userId: string;
  host: string;
  port: number;
  tokenEncrypted: string;
  tokenIv: string;
  tokenTag: string;
  isSplunkCloud: boolean;
  isVerified: boolean;
  createdAt: string;
}

export interface DBIncident {
  id: string;
  userId: string;
  description: string;
  affectedServices: string;
  severity: string | null;
  status: string;
  healerFindings: string | null;
  sentinelFindings: string | null;
  correlationVerdict: string | null;
  executionPlan: string | null;
  executionResults: string | null;
  humanDecision: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AgentMemoryRecord {
  id: number;
  userId: string;
  incidentId: string;
  agent: string;
  actionType: string;
  affectedServices: string;
  findings: string;
  recommendation: string | null;
  humanDecision: string | null;
  blastRadiusScore: number | null;
  createdAt: string;
}

export interface GitHubConnection {
  id: string;
  userId: string;
  tokenEncrypted: string;
  tokenIv: string;
  tokenTag: string;
  username: string | null;
  isVerified: boolean;
  createdAt: string;
}

export interface ServiceRepoMapping {
  id: string;
  userId: string;
  serviceName: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  pathPatterns: string[];
  createdAt: string;
}

export interface AegisPullRequest {
  id: string;
  incidentId: string;
  userId: string;
  repoFullName: string;
  prNumber: number;
  prUrl: string;
  branchName: string;
  title: string;
  status: string;
  filesChanged: string[];
  humanFeedback: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ServiceDependency {
  id: number;
  userId: string;
  serviceName: string;
  dependsOn: string;
  dependencyType: "runtime" | "build" | "data" | "async";
  criticality: "low" | "medium" | "high" | "critical";
  createdAt: string;
}

export interface Integration {
  id: string;
  userId: string;
  type: "slack" | "pagerduty" | "email" | "webhook";
  configEncrypted: string;
  configIv: string;
  configTag: string;
  isVerified: boolean;
  createdAt: string;
}

class DatabaseManager {
  private db: Database.Database;

  constructor() {
    const dbPath = join(__dirname, "../../data/aegis.db");

    // Ensure data directory exists
    const dataDir = dirname(dbPath);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initialize();
  }

  private initialize(): void {
    const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    this.db.exec(schema);
  }

  // ==================== USER METHODS ====================

  createUser(user: { id: string; email: string; passwordHash: string; name: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, email, password_hash, name)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(user.id, user.email, user.passwordHash, user.name);
  }

  getUserById(id: string): User | undefined {
    const stmt = this.db.prepare(`
      SELECT id, email, password_hash as passwordHash, name, created_at as createdAt, updated_at as updatedAt
      FROM users WHERE id = ?
    `);
    return stmt.get(id) as User | undefined;
  }

  getUserByEmail(email: string): User | undefined {
    const stmt = this.db.prepare(`
      SELECT id, email, password_hash as passwordHash, name, created_at as createdAt, updated_at as updatedAt
      FROM users WHERE email = ?
    `);
    return stmt.get(email) as User | undefined;
  }

  // ==================== SPLUNK CONNECTION METHODS ====================

  saveSplunkConnection(connection: {
    id: string;
    userId: string;
    host: string;
    port: number;
    tokenEncrypted: string;
    tokenIv: string;
    tokenTag: string;
    isSplunkCloud: boolean;
    isVerified: boolean;
  }): void {
    // Delete existing connection first (one per user)
    this.db.prepare("DELETE FROM splunk_connections WHERE user_id = ?").run(connection.userId);

    const stmt = this.db.prepare(`
      INSERT INTO splunk_connections (id, user_id, host, port, token_encrypted, token_iv, token_tag, is_splunk_cloud, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      connection.id,
      connection.userId,
      connection.host,
      connection.port,
      connection.tokenEncrypted,
      connection.tokenIv,
      connection.tokenTag,
      connection.isSplunkCloud ? 1 : 0,
      connection.isVerified ? 1 : 0
    );
  }

  getSplunkConnection(userId: string): SplunkConnection | undefined {
    const stmt = this.db.prepare(`
      SELECT
        id,
        user_id as userId,
        host,
        port,
        token_encrypted as tokenEncrypted,
        token_iv as tokenIv,
        token_tag as tokenTag,
        is_splunk_cloud as isSplunkCloud,
        is_verified as isVerified,
        created_at as createdAt
      FROM splunk_connections
      WHERE user_id = ?
    `);
    const row = stmt.get(userId) as (Omit<SplunkConnection, 'isVerified' | 'isSplunkCloud'> & { isVerified: number; isSplunkCloud: number }) | undefined;
    if (!row) return undefined;
    return { ...row, isVerified: row.isVerified === 1, isSplunkCloud: row.isSplunkCloud === 1 };
  }

  deleteSplunkConnection(userId: string): void {
    this.db.prepare("DELETE FROM splunk_connections WHERE user_id = ?").run(userId);
  }

  // ==================== INCIDENT METHODS ====================

  createIncident(incident: {
    id: string;
    userId: string;
    description: string;
    affectedServices: string[];
    severity?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO incidents (id, user_id, description, affected_services, severity)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      incident.id,
      incident.userId,
      incident.description,
      JSON.stringify(incident.affectedServices),
      incident.severity || null
    );
  }

  updateIncident(id: string, updates: Partial<{
    severity: string;
    status: string;
    healerFindings: object;
    sentinelFindings: object;
    correlationVerdict: object;
    executionPlan: object;
    executionResults: object;
    humanDecision: object;
    resolvedAt: string;
  }>): void {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.severity !== undefined) {
      setClauses.push("severity = ?");
      values.push(updates.severity);
    }
    if (updates.status !== undefined) {
      setClauses.push("status = ?");
      values.push(updates.status);
    }
    if (updates.healerFindings !== undefined) {
      setClauses.push("healer_findings = ?");
      values.push(JSON.stringify(updates.healerFindings));
    }
    if (updates.sentinelFindings !== undefined) {
      setClauses.push("sentinel_findings = ?");
      values.push(JSON.stringify(updates.sentinelFindings));
    }
    if (updates.correlationVerdict !== undefined) {
      setClauses.push("correlation_verdict = ?");
      values.push(JSON.stringify(updates.correlationVerdict));
    }
    if (updates.executionPlan !== undefined) {
      setClauses.push("execution_plan = ?");
      values.push(JSON.stringify(updates.executionPlan));
    }
    if (updates.executionResults !== undefined) {
      setClauses.push("execution_results = ?");
      values.push(JSON.stringify(updates.executionResults));
    }
    if (updates.humanDecision !== undefined) {
      setClauses.push("human_decision = ?");
      values.push(JSON.stringify(updates.humanDecision));
    }
    if (updates.resolvedAt !== undefined) {
      setClauses.push("resolved_at = ?");
      values.push(updates.resolvedAt);
    }

    if (setClauses.length === 0) return;

    values.push(id);
    const stmt = this.db.prepare(`
      UPDATE incidents SET ${setClauses.join(", ")} WHERE id = ?
    `);
    stmt.run(...values);
  }

  getIncident(id: string, userId?: string): DBIncident | undefined {
    let query = `
      SELECT
        id, user_id as userId, description, affected_services as affectedServices,
        severity, status, healer_findings as healerFindings,
        sentinel_findings as sentinelFindings, correlation_verdict as correlationVerdict,
        execution_plan as executionPlan, execution_results as executionResults,
        human_decision as humanDecision, created_at as createdAt, resolved_at as resolvedAt
      FROM incidents
      WHERE id = ?
    `;
    const params: string[] = [id];

    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }

    return this.db.prepare(query).get(...params) as DBIncident | undefined;
  }

  getIncidentsByUser(userId: string, limit = 50): DBIncident[] {
    const stmt = this.db.prepare(`
      SELECT
        id, user_id as userId, description, affected_services as affectedServices,
        severity, status, healer_findings as healerFindings,
        sentinel_findings as sentinelFindings, correlation_verdict as correlationVerdict,
        execution_plan as executionPlan, execution_results as executionResults,
        human_decision as humanDecision, created_at as createdAt, resolved_at as resolvedAt
      FROM incidents
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(userId, limit) as DBIncident[];
  }

  // Convert DB incident to AegisState
  dbIncidentToState(dbIncident: DBIncident): AegisState {
    return {
      incidentId: dbIncident.id,
      timestamp: dbIncident.createdAt,
      severity: (dbIncident.severity as AegisState["severity"]) || "medium",
      status: dbIncident.status as AegisState["status"],
      trigger: {
        source: "manual",
        description: dbIncident.description,
        affectedServices: JSON.parse(dbIncident.affectedServices),
      },
      healerFindings: dbIncident.healerFindings ? JSON.parse(dbIncident.healerFindings) : undefined,
      sentinelFindings: dbIncident.sentinelFindings ? JSON.parse(dbIncident.sentinelFindings) : undefined,
      correlationVerdict: dbIncident.correlationVerdict ? JSON.parse(dbIncident.correlationVerdict) : undefined,
      executionPlan: dbIncident.executionPlan ? JSON.parse(dbIncident.executionPlan) : undefined,
      executionResults: dbIncident.executionResults ? JSON.parse(dbIncident.executionResults) : undefined,
      humanDecision: dbIncident.humanDecision ? JSON.parse(dbIncident.humanDecision) : undefined,
      errors: [],
    };
  }

  // ==================== AGENT MEMORY METHODS ====================

  saveAgentMemory(memory: {
    userId: string;
    incidentId: string;
    agent: string;
    actionType: string;
    affectedServices: string[];
    findings: object;
    recommendation?: string;
    humanDecision?: string;
    blastRadiusScore?: number;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO agent_memory
        (user_id, incident_id, agent, action_type, affected_services, findings, recommendation, human_decision, blast_radius_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      memory.userId,
      memory.incidentId,
      memory.agent,
      memory.actionType,
      JSON.stringify(memory.affectedServices),
      JSON.stringify(memory.findings),
      memory.recommendation || null,
      memory.humanDecision || null,
      memory.blastRadiusScore || null
    );
  }

  queryAgentMemory(userId: string, service: string, limit = 10): AgentMemoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        id, user_id as userId, incident_id as incidentId, agent, action_type as actionType,
        affected_services as affectedServices, findings, recommendation,
        human_decision as humanDecision, blast_radius_score as blastRadiusScore,
        created_at as createdAt
      FROM agent_memory
      WHERE user_id = ? AND affected_services LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(userId, `%${service}%`, limit) as AgentMemoryRecord[];
  }

  // ==================== SESSION METHODS ====================

  createSession(session: {
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(session.id, session.userId, session.refreshTokenHash, session.expiresAt);
  }

  deleteSession(id: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  deleteUserSessions(userId: string): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  // ==================== GITHUB CONNECTION METHODS ====================

  saveGitHubConnection(connection: {
    id: string;
    userId: string;
    tokenEncrypted: string;
    tokenIv: string;
    tokenTag: string;
    username?: string;
    isVerified: boolean;
  }): void {
    // Delete existing connection first (one per user)
    this.db.prepare("DELETE FROM github_connections WHERE user_id = ?").run(connection.userId);

    const stmt = this.db.prepare(`
      INSERT INTO github_connections (id, user_id, token_encrypted, token_iv, token_tag, username, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      connection.id,
      connection.userId,
      connection.tokenEncrypted,
      connection.tokenIv,
      connection.tokenTag,
      connection.username || null,
      connection.isVerified ? 1 : 0
    );
  }

  getGitHubConnection(userId: string): GitHubConnection | undefined {
    const stmt = this.db.prepare(`
      SELECT
        id,
        user_id as userId,
        token_encrypted as tokenEncrypted,
        token_iv as tokenIv,
        token_tag as tokenTag,
        username,
        is_verified as isVerified,
        created_at as createdAt
      FROM github_connections
      WHERE user_id = ?
    `);
    const row = stmt.get(userId) as (Omit<GitHubConnection, 'isVerified'> & { isVerified: number }) | undefined;
    if (!row) return undefined;
    return { ...row, isVerified: row.isVerified === 1 };
  }

  deleteGitHubConnection(userId: string): void {
    this.db.prepare("DELETE FROM github_connections WHERE user_id = ?").run(userId);
  }

  // ==================== SERVICE REPO MAPPING METHODS ====================

  saveServiceRepoMapping(mapping: {
    id: string;
    userId: string;
    serviceName: string;
    repoOwner: string;
    repoName: string;
    defaultBranch?: string;
    pathPatterns?: string[];
  }): void {
    // Upsert - delete existing mapping for this service first
    this.db.prepare(
      "DELETE FROM service_repo_mappings WHERE user_id = ? AND service_name = ?"
    ).run(mapping.userId, mapping.serviceName);

    const stmt = this.db.prepare(`
      INSERT INTO service_repo_mappings
        (id, user_id, service_name, repo_owner, repo_name, default_branch, path_patterns)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      mapping.id,
      mapping.userId,
      mapping.serviceName,
      mapping.repoOwner,
      mapping.repoName,
      mapping.defaultBranch || "main",
      JSON.stringify(mapping.pathPatterns || ["**/*"])
    );
  }

  getServiceRepoMapping(userId: string, serviceName: string): ServiceRepoMapping | undefined {
    const stmt = this.db.prepare(`
      SELECT
        id,
        user_id as userId,
        service_name as serviceName,
        repo_owner as repoOwner,
        repo_name as repoName,
        default_branch as defaultBranch,
        path_patterns as pathPatterns,
        created_at as createdAt
      FROM service_repo_mappings
      WHERE user_id = ? AND service_name = ?
    `);
    const row = stmt.get(userId, serviceName) as (Omit<ServiceRepoMapping, 'pathPatterns'> & { pathPatterns: string }) | undefined;
    if (!row) return undefined;
    return { ...row, pathPatterns: JSON.parse(row.pathPatterns) };
  }

  getServiceRepoMappings(userId: string): ServiceRepoMapping[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        user_id as userId,
        service_name as serviceName,
        repo_owner as repoOwner,
        repo_name as repoName,
        default_branch as defaultBranch,
        path_patterns as pathPatterns,
        created_at as createdAt
      FROM service_repo_mappings
      WHERE user_id = ?
      ORDER BY service_name
    `);
    const rows = stmt.all(userId) as Array<Omit<ServiceRepoMapping, 'pathPatterns'> & { pathPatterns: string }>;
    return rows.map(row => ({ ...row, pathPatterns: JSON.parse(row.pathPatterns) }));
  }

  deleteServiceRepoMapping(userId: string, serviceName: string): void {
    this.db.prepare(
      "DELETE FROM service_repo_mappings WHERE user_id = ? AND service_name = ?"
    ).run(userId, serviceName);
  }

  // ==================== AEGIS PR METHODS ====================

  saveAegisPR(pr: {
    id: string;
    incidentId: string;
    userId: string;
    repoFullName: string;
    prNumber: number;
    prUrl: string;
    branchName: string;
    title: string;
    filesChanged: string[];
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO aegis_pull_requests
        (id, incident_id, user_id, repo_full_name, pr_number, pr_url, branch_name, title, files_changed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      pr.id,
      pr.incidentId,
      pr.userId,
      pr.repoFullName,
      pr.prNumber,
      pr.prUrl,
      pr.branchName,
      pr.title,
      JSON.stringify(pr.filesChanged)
    );
  }

  getAegisPRsByIncident(incidentId: string): AegisPullRequest[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        incident_id as incidentId,
        user_id as userId,
        repo_full_name as repoFullName,
        pr_number as prNumber,
        pr_url as prUrl,
        branch_name as branchName,
        title,
        status,
        files_changed as filesChanged,
        human_feedback as humanFeedback,
        created_at as createdAt,
        resolved_at as resolvedAt
      FROM aegis_pull_requests
      WHERE incident_id = ?
      ORDER BY created_at DESC
    `);
    const rows = stmt.all(incidentId) as Array<Omit<AegisPullRequest, 'filesChanged'> & { filesChanged: string }>;
    return rows.map(row => ({ ...row, filesChanged: JSON.parse(row.filesChanged) }));
  }

  updateAegisPRStatus(id: string, status: string, humanFeedback?: string): void {
    const stmt = this.db.prepare(`
      UPDATE aegis_pull_requests
      SET status = ?, human_feedback = ?, resolved_at = ?
      WHERE id = ?
    `);
    stmt.run(status, humanFeedback || null, status !== "open" ? new Date().toISOString() : null, id);
  }

  // ==================== SERVICE DEPENDENCIES ====================

  saveServiceDependency(dep: {
    userId: string;
    serviceName: string;
    dependsOn: string;
    dependencyType?: string;
    criticality?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO service_dependencies
        (user_id, service_name, depends_on, dependency_type, criticality)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      dep.userId,
      dep.serviceName,
      dep.dependsOn,
      dep.dependencyType || "runtime",
      dep.criticality || "medium"
    );
  }

  getServiceDependencies(userId: string, serviceName: string): ServiceDependency[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        user_id as userId,
        service_name as serviceName,
        depends_on as dependsOn,
        dependency_type as dependencyType,
        criticality,
        created_at as createdAt
      FROM service_dependencies
      WHERE user_id = ? AND service_name = ?
    `);
    return stmt.all(userId, serviceName) as ServiceDependency[];
  }

  getDependentServices(userId: string, serviceName: string): ServiceDependency[] {
    // Get services that depend ON this service (reverse lookup)
    const stmt = this.db.prepare(`
      SELECT
        id,
        user_id as userId,
        service_name as serviceName,
        depends_on as dependsOn,
        dependency_type as dependencyType,
        criticality,
        created_at as createdAt
      FROM service_dependencies
      WHERE user_id = ? AND depends_on = ?
    `);
    return stmt.all(userId, serviceName) as ServiceDependency[];
  }

  getAllServiceDependencies(userId: string): ServiceDependency[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        user_id as userId,
        service_name as serviceName,
        depends_on as dependsOn,
        dependency_type as dependencyType,
        criticality,
        created_at as createdAt
      FROM service_dependencies
      WHERE user_id = ?
      ORDER BY service_name, depends_on
    `);
    return stmt.all(userId) as ServiceDependency[];
  }

  deleteServiceDependency(userId: string, serviceName: string, dependsOn: string): void {
    this.db.prepare(
      "DELETE FROM service_dependencies WHERE user_id = ? AND service_name = ? AND depends_on = ?"
    ).run(userId, serviceName, dependsOn);
  }

  // ==================== INTEGRATIONS ====================

  saveIntegration(integration: {
    id: string;
    userId: string;
    type: string;
    configEncrypted: string;
    configIv: string;
    configTag: string;
    isVerified: boolean;
  }): void {
    // Upsert - one integration per type per user
    this.db.prepare(
      "DELETE FROM integrations WHERE user_id = ? AND type = ?"
    ).run(integration.userId, integration.type);

    const stmt = this.db.prepare(`
      INSERT INTO integrations
        (id, user_id, type, config_encrypted, config_iv, config_tag, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      integration.id,
      integration.userId,
      integration.type,
      integration.configEncrypted,
      integration.configIv,
      integration.configTag,
      integration.isVerified ? 1 : 0
    );
  }

  getIntegration(userId: string, type: string): Integration | undefined {
    const stmt = this.db.prepare(`
      SELECT
        id,
        user_id as userId,
        type,
        config_encrypted as configEncrypted,
        config_iv as configIv,
        config_tag as configTag,
        is_verified as isVerified,
        created_at as createdAt
      FROM integrations
      WHERE user_id = ? AND type = ?
    `);
    const row = stmt.get(userId, type) as (Omit<Integration, 'isVerified'> & { isVerified: number }) | undefined;
    if (!row) return undefined;
    return { ...row, isVerified: row.isVerified === 1 };
  }

  getAllIntegrations(userId: string): Integration[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        user_id as userId,
        type,
        config_encrypted as configEncrypted,
        config_iv as configIv,
        config_tag as configTag,
        is_verified as isVerified,
        created_at as createdAt
      FROM integrations
      WHERE user_id = ?
    `);
    const rows = stmt.all(userId) as Array<Omit<Integration, 'isVerified'> & { isVerified: number }>;
    return rows.map(row => ({ ...row, isVerified: row.isVerified === 1 }));
  }

  deleteIntegration(userId: string, type: string): void {
    this.db.prepare(
      "DELETE FROM integrations WHERE user_id = ? AND type = ?"
    ).run(userId, type);
  }

  // ==================== UTILITY ====================

  close(): void {
    this.db.close();
  }
}

// Singleton instance
export const db = new DatabaseManager();
