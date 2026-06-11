/**
 * GitHub API Service
 * Handles all GitHub interactions for code fixes and PR creation
 */

export interface GitHubFile {
  path: string;
  content: string;
  sha: string;
  encoding: string;
}

export interface GitHubBranch {
  name: string;
  sha: string;
}

export interface GitHubPR {
  number: number;
  html_url: string;
  title: string;
  state: string;
}

export interface CodeFix {
  file: string;
  originalContent: string;
  fixedContent: string;
  diff: string;
  description: string;
}

export class GitHubService {
  private token: string;
  private baseUrl = "https://api.github.com";

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "AegisOps/1.0",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${error}`);
    }

    // Handle no content response
    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Verify the token is valid and get user info
   */
  async verifyToken(): Promise<{ login: string; name: string | null }> {
    const user = await this.request<{ login: string; name: string | null }>(
      "GET",
      "/user"
    );
    return { login: user.login, name: user.name };
  }

  /**
   * List repositories accessible to the user
   */
  async listRepositories(): Promise<
    Array<{ full_name: string; name: string; owner: { login: string } }>
  > {
    return this.request("GET", "/user/repos?per_page=100&sort=updated");
  }

  /**
   * Get file content from a repository
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<GitHubFile> {
    const endpoint = `/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ""}`;
    const response = await this.request<{
      path: string;
      content: string;
      sha: string;
      encoding: string;
    }>("GET", endpoint);

    return {
      path: response.path,
      content: Buffer.from(response.content, "base64").toString("utf-8"),
      sha: response.sha,
      encoding: response.encoding,
    };
  }

  /**
   * Search for files in a repository
   */
  async searchFiles(
    owner: string,
    repo: string,
    query: string
  ): Promise<Array<{ path: string; name: string }>> {
    const response = await this.request<{
      items: Array<{ path: string; name: string }>;
    }>("GET", `/search/code?q=${encodeURIComponent(query)}+repo:${owner}/${repo}`);
    return response.items || [];
  }

  /**
   * Get the default branch of a repository
   */
  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const response = await this.request<{ default_branch: string }>(
      "GET",
      `/repos/${owner}/${repo}`
    );
    return response.default_branch;
  }

  /**
   * Get the latest commit SHA of a branch
   */
  async getBranchSha(
    owner: string,
    repo: string,
    branch: string
  ): Promise<string> {
    const response = await this.request<{ object: { sha: string } }>(
      "GET",
      `/repos/${owner}/${repo}/git/ref/heads/${branch}`
    );
    return response.object.sha;
  }

  /**
   * Create a new branch
   */
  async createBranch(
    owner: string,
    repo: string,
    branchName: string,
    fromSha: string
  ): Promise<void> {
    await this.request("POST", `/repos/${owner}/${repo}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    });
  }

  /**
   * Update a file in a repository
   */
  async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    fileSha: string
  ): Promise<{ sha: string }> {
    const response = await this.request<{ commit: { sha: string } }>(
      "PUT",
      `/repos/${owner}/${repo}/contents/${path}`,
      {
        message,
        content: Buffer.from(content).toString("base64"),
        branch,
        sha: fileSha,
      }
    );
    return { sha: response.commit.sha };
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string
  ): Promise<GitHubPR> {
    return this.request("POST", `/repos/${owner}/${repo}/pulls`, {
      title,
      body,
      head,
      base,
    });
  }

  /**
   * Create a complete code fix PR
   * This is the main method that orchestrates the entire flow
   */
  async createCodeFixPR(params: {
    owner: string;
    repo: string;
    incidentId: string;
    fix: CodeFix;
    incidentDescription: string;
    rootCause: string;
  }): Promise<GitHubPR> {
    const { owner, repo, incidentId, fix, incidentDescription, rootCause } = params;

    // 1. Get default branch and its SHA
    const defaultBranch = await this.getDefaultBranch(owner, repo);
    const baseSha = await this.getBranchSha(owner, repo, defaultBranch);

    // 2. Create a new branch for the fix
    const branchName = `aegis/fix-${incidentId.toLowerCase()}-${Date.now()}`;
    await this.createBranch(owner, repo, branchName, baseSha);

    // 3. Get current file SHA
    const currentFile = await this.getFileContent(owner, repo, fix.file, defaultBranch);

    // 4. Commit the fix
    const commitMessage = `fix: ${fix.description}

Incident: ${incidentId}
Generated by AegisOps`;

    await this.updateFile(
      owner,
      repo,
      fix.file,
      fix.fixedContent,
      commitMessage,
      branchName,
      currentFile.sha
    );

    // 5. Create the PR
    const prBody = this.generatePRBody({
      incidentId,
      incidentDescription,
      rootCause,
      fix,
    });

    const pr = await this.createPullRequest(
      owner,
      repo,
      `fix: ${fix.description}`,
      prBody,
      branchName,
      defaultBranch
    );

    return pr;
  }

  /**
   * Generate a detailed PR body with incident context
   */
  private generatePRBody(params: {
    incidentId: string;
    incidentDescription: string;
    rootCause: string;
    fix: CodeFix;
  }): string {
    const { incidentId, incidentDescription, rootCause, fix } = params;

    return `## 🚨 Incident: ${incidentId}

### Description
${incidentDescription}

### 🔍 Root Cause Analysis
${rootCause}

### 🛠️ Fix Applied
**File:** \`${fix.file}\`

${fix.description}

### 📝 Changes
\`\`\`diff
${fix.diff}
\`\`\`

### ✅ Review Checklist
- [ ] Code changes are correct
- [ ] No security vulnerabilities introduced
- [ ] Tests pass (if applicable)
- [ ] Ready for production

### 🔄 Rollback
If issues arise after merge:
\`\`\`bash
git revert <commit-sha>
\`\`\`

---

🤖 *Generated by [AegisOps](https://github.com/aegisops) - Autonomous Incident Response*

Labels: \`aegis-generated\` \`incident-response\``;
  }
}

/**
 * Generate a unified diff between two strings
 */
export function generateDiff(
  originalContent: string,
  newContent: string,
  filePath: string
): string {
  const originalLines = originalContent.split("\n");
  const newLines = newContent.split("\n");

  const diff: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  // Simple line-by-line diff (for display purposes)
  // In production, you'd use a proper diff library
  let i = 0;
  let j = 0;
  let hunkStart = -1;
  const hunk: string[] = [];

  while (i < originalLines.length || j < newLines.length) {
    if (i < originalLines.length && j < newLines.length) {
      if (originalLines[i] === newLines[j]) {
        if (hunk.length > 0) {
          hunk.push(` ${originalLines[i]}`);
        }
        i++;
        j++;
      } else {
        if (hunkStart === -1) {
          hunkStart = i;
          // Add context before
          for (let k = Math.max(0, i - 3); k < i; k++) {
            hunk.push(` ${originalLines[k]}`);
          }
        }
        // Find matching line ahead
        let foundMatch = false;
        for (let look = 1; look < 5; look++) {
          if (originalLines[i] === newLines[j + look]) {
            // Lines were added
            for (let k = 0; k < look; k++) {
              hunk.push(`+${newLines[j + k]}`);
            }
            j += look;
            foundMatch = true;
            break;
          }
          if (originalLines[i + look] === newLines[j]) {
            // Lines were removed
            for (let k = 0; k < look; k++) {
              hunk.push(`-${originalLines[i + k]}`);
            }
            i += look;
            foundMatch = true;
            break;
          }
        }
        if (!foundMatch) {
          hunk.push(`-${originalLines[i] || ""}`);
          hunk.push(`+${newLines[j] || ""}`);
          i++;
          j++;
        }
      }
    } else if (i < originalLines.length) {
      if (hunkStart === -1) hunkStart = i;
      hunk.push(`-${originalLines[i]}`);
      i++;
    } else {
      if (hunkStart === -1) hunkStart = j;
      hunk.push(`+${newLines[j]}`);
      j++;
    }
  }

  if (hunk.length > 0) {
    diff.push(`@@ -${hunkStart + 1},${originalLines.length} +${hunkStart + 1},${newLines.length} @@`);
    diff.push(...hunk);
  }

  return diff.join("\n");
}
