import { Router, Response } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import { db } from "../db/index.js";
import { GitHubService, generateDiff, CodeFix } from "../services/github.js";

export const githubRouter = Router();
githubRouter.use(authMiddleware);

// Validation schemas
const connectSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

const mappingSchema = z.object({
  serviceName: z.string().min(1).max(100),
  repoOwner: z.string().min(1).max(100),
  repoName: z.string().min(1).max(100),
  defaultBranch: z.string().default("main"),
  pathPatterns: z.array(z.string()).default(["**/*"]),
});

const createPRSchema = z.object({
  incidentId: z.string().min(1),
  serviceName: z.string().min(1),
  filePath: z.string().min(1),
  fixedContent: z.string().min(1),
  description: z.string().min(1),
  rootCause: z.string().min(1),
});

/**
 * POST /github/connect - Connect GitHub account with PAT
 */
githubRouter.post("/connect", async (req: AuthRequest, res: Response) => {
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    return;
  }

  const { token } = parsed.data;

  try {
    // Verify token works
    const github = new GitHubService(token);
    const user = await github.verifyToken();

    // Encrypt and store
    const { encrypted, iv, tag } = encrypt(token);
    db.saveGitHubConnection({
      id: uuidv4(),
      userId: req.userId!,
      tokenEncrypted: encrypted,
      tokenIv: iv,
      tokenTag: tag,
      username: user.login,
      isVerified: true,
    });

    res.json({
      success: true,
      username: user.login,
      message: "GitHub connected successfully",
    });
  } catch (error) {
    res.status(400).json({
      error: "Failed to verify GitHub token",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /github/status - Check GitHub connection status
 */
githubRouter.get("/status", (req: AuthRequest, res: Response) => {
  const connection = db.getGitHubConnection(req.userId!);
  if (!connection) {
    res.json({ connected: false });
    return;
  }
  res.json({
    connected: true,
    username: connection.username,
    isVerified: connection.isVerified,
  });
});

/**
 * DELETE /github/disconnect - Disconnect GitHub
 */
githubRouter.delete("/disconnect", (req: AuthRequest, res: Response) => {
  db.deleteGitHubConnection(req.userId!);
  res.json({ success: true });
});

/**
 * GET /github/repos - List available repositories
 */
githubRouter.get("/repos", async (req: AuthRequest, res: Response) => {
  const connection = db.getGitHubConnection(req.userId!);
  if (!connection) {
    res.status(400).json({ error: "GitHub not connected" });
    return;
  }

  try {
    const token = decrypt(connection.tokenEncrypted, connection.tokenIv, connection.tokenTag);
    const github = new GitHubService(token);
    const repos = await github.listRepositories();

    res.json({
      repos: repos.map((r) => ({
        fullName: r.full_name,
        name: r.name,
        owner: r.owner.login,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch repositories",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /github/mappings - Create or update service-repo mapping
 */
githubRouter.post("/mappings", (req: AuthRequest, res: Response) => {
  const parsed = mappingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    return;
  }

  db.saveServiceRepoMapping({
    id: uuidv4(),
    userId: req.userId!,
    ...parsed.data,
  });

  res.json({ success: true, message: "Mapping saved" });
});

/**
 * GET /github/mappings - Get all service-repo mappings
 */
githubRouter.get("/mappings", (req: AuthRequest, res: Response) => {
  const mappings = db.getServiceRepoMappings(req.userId!);
  res.json({ mappings });
});

/**
 * DELETE /github/mappings/:serviceName - Delete a mapping
 */
githubRouter.delete("/mappings/:serviceName", (req: AuthRequest, res: Response) => {
  db.deleteServiceRepoMapping(req.userId!, req.params.serviceName);
  res.json({ success: true });
});

/**
 * GET /github/file - Get file content from a mapped repo
 */
githubRouter.get("/file", async (req: AuthRequest, res: Response) => {
  const { serviceName, filePath } = req.query;

  if (!serviceName || !filePath) {
    res.status(400).json({ error: "serviceName and filePath are required" });
    return;
  }

  const connection = db.getGitHubConnection(req.userId!);
  if (!connection) {
    res.status(400).json({ error: "GitHub not connected" });
    return;
  }

  const mapping = db.getServiceRepoMapping(req.userId!, serviceName as string);
  if (!mapping) {
    res.status(400).json({ error: `No repository mapping for service: ${serviceName}` });
    return;
  }

  try {
    const token = decrypt(connection.tokenEncrypted, connection.tokenIv, connection.tokenTag);
    const github = new GitHubService(token);
    const file = await github.getFileContent(mapping.repoOwner, mapping.repoName, filePath as string);

    res.json({
      path: file.path,
      content: file.content,
      sha: file.sha,
      repo: `${mapping.repoOwner}/${mapping.repoName}`,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch file",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /github/preview-diff - Preview a code fix diff
 */
githubRouter.post("/preview-diff", async (req: AuthRequest, res: Response) => {
  const { serviceName, filePath, fixedContent } = req.body;

  if (!serviceName || !filePath || !fixedContent) {
    res.status(400).json({ error: "serviceName, filePath, and fixedContent are required" });
    return;
  }

  const connection = db.getGitHubConnection(req.userId!);
  if (!connection) {
    res.status(400).json({ error: "GitHub not connected" });
    return;
  }

  const mapping = db.getServiceRepoMapping(req.userId!, serviceName);
  if (!mapping) {
    res.status(400).json({ error: `No repository mapping for service: ${serviceName}` });
    return;
  }

  try {
    const token = decrypt(connection.tokenEncrypted, connection.tokenIv, connection.tokenTag);
    const github = new GitHubService(token);
    const file = await github.getFileContent(mapping.repoOwner, mapping.repoName, filePath);

    const diff = generateDiff(file.content, fixedContent, filePath);

    res.json({
      originalContent: file.content,
      fixedContent,
      diff,
      filePath,
      repo: `${mapping.repoOwner}/${mapping.repoName}`,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate diff",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /github/create-pr - Create a PR with the code fix
 */
githubRouter.post("/create-pr", async (req: AuthRequest, res: Response) => {
  const parsed = createPRSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
    return;
  }

  const { incidentId, serviceName, filePath, fixedContent, description, rootCause } = parsed.data;

  const connection = db.getGitHubConnection(req.userId!);
  if (!connection) {
    res.status(400).json({ error: "GitHub not connected" });
    return;
  }

  const mapping = db.getServiceRepoMapping(req.userId!, serviceName);
  if (!mapping) {
    res.status(400).json({ error: `No repository mapping for service: ${serviceName}` });
    return;
  }

  // Get incident description
  const incident = db.getIncident(incidentId, req.userId!);
  if (!incident) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  try {
    const token = decrypt(connection.tokenEncrypted, connection.tokenIv, connection.tokenTag);
    const github = new GitHubService(token);

    // Get original file content for diff
    const originalFile = await github.getFileContent(mapping.repoOwner, mapping.repoName, filePath);
    const diff = generateDiff(originalFile.content, fixedContent, filePath);

    const fix: CodeFix = {
      file: filePath,
      originalContent: originalFile.content,
      fixedContent,
      diff,
      description,
    };

    // Create the PR
    const pr = await github.createCodeFixPR({
      owner: mapping.repoOwner,
      repo: mapping.repoName,
      incidentId,
      fix,
      incidentDescription: incident.description,
      rootCause,
    });

    // Save PR record
    db.saveAegisPR({
      id: uuidv4(),
      incidentId,
      userId: req.userId!,
      repoFullName: `${mapping.repoOwner}/${mapping.repoName}`,
      prNumber: pr.number,
      prUrl: pr.html_url,
      branchName: `aegis/fix-${incidentId.toLowerCase()}`,
      title: pr.title,
      filesChanged: [filePath],
    });

    res.json({
      success: true,
      pr: {
        number: pr.number,
        url: pr.html_url,
        title: pr.title,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create PR",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /github/prs/:incidentId - Get PRs for an incident
 */
githubRouter.get("/prs/:incidentId", (req: AuthRequest, res: Response) => {
  const prs = db.getAegisPRsByIncident(req.params.incidentId);
  res.json({ prs });
});
