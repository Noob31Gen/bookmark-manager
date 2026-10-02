/**
 * Noob31 Bookmark Vault - GitHub Sync Engine
 * Modeled on robust client-side REST sync with conflict resolution,
 * UTF-8 Base64 encoding/decoding, Git Data API batching with Contents API fallback,
 * and cross-machine bookmark restoration.
 */
import { GitHubConfig, EnhancedBookmark, BookmarkMetadata, FolderNode } from "./types";
import { saveGitHubConfig, getAllMetadata, bulkUpdateMetadata, saveBookmarkMetadata } from "./metadataStore";
import { getEnhancedBookmarkTree, extractAllBookmarks, extractFolderTree, createBookmark } from "./chromeBookmarks";
import { getDomain } from "./utils";

// --- Sanitization & Token Formatting ---
export function sanitizeGitHubConfig(config: GitHubConfig): GitHubConfig {
  let owner = (config.owner || "").trim();
  let repo = (config.repo || "").trim();
  let token = (config.token || "").trim();
  let branch = (config.branch || "").trim() || "main";

  // Strip wrapping quotes and authorization prefixes
  token = token.replace(/^["']|["']$/g, "").replace(/^(Bearer|token)\s+/i, "").trim();
  owner = owner.replace(/^["']|["']$/g, "").trim();
  repo = repo.replace(/^["']|["']$/g, "").trim();

  // Extract from full GitHub URLs (e.g. https://github.com/Noob31Gen/bookmark-vault or git@github.com:owner/repo.git)
  if (owner.includes("github.com")) {
    const cleanUrl = owner.replace(/^(https?:\/\/)?(www\.)?github\.com[\/:]/, "").replace(/\.git$/, "");
    const parts = cleanUrl.split("/").filter(Boolean);
    if (parts.length >= 1) owner = parts[0];
    if (parts.length >= 2 && !repo) repo = parts[1];
  } else if (owner.includes("/")) {
    const parts = owner.split("/").filter(Boolean);
    if (parts.length >= 1) owner = parts[0];
    if (parts.length >= 2 && !repo) repo = parts[1];
  }

  if (repo.includes("github.com")) {
    const cleanUrl = repo.replace(/^(https?:\/\/)?(www\.)?github\.com[\/:]/, "").replace(/\.git$/, "");
    const parts = cleanUrl.split("/").filter(Boolean);
    if (parts.length >= 2) {
      owner = parts[0];
      repo = parts[1];
    } else if (parts.length === 1) {
      repo = parts[0];
    }
  } else if (repo.includes("/")) {
    const parts = repo.split("/").filter(Boolean);
    if (parts.length >= 2) {
      owner = parts[0];
      repo = parts[1];
    }
  }

  owner = owner.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
  repo = repo.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
  branch = branch.replace(/^refs\/heads\//, "").replace(/^\/+|\/+$/g, "") || "main";

  return {
    ...config,
    owner,
    repo,
    token,
    branch,
    enabled: !!(token && owner && repo),
  };
}

// --- UTF-8 Safe Base64 Encoding and Decoding ---
export function safeB64Encode(str: string): string {
  const utf8Bytes = new TextEncoder().encode(str);
  let binaryString = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binaryString += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binaryString);
}

export function safeB64Decode(str: string): string {
  const binaryString = atob((str || "").replace(/\s/g, ""));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export const utf8ToBase64 = safeB64Encode;
export const base64ToUtf8 = safeB64Decode;

export function isValidGitSha(sha?: string | null): boolean {
  return typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha.trim());
}

// Strictly cleans path segments for Git Tree compatibility
export function sanitizePathSegment(name: string): string {
  let cleaned = (name || "untitled")
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "") // Strip invisible control characters
    .replace(/[/\\?%*:|"<>]/g, "-") // Replace forbidden chars
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();

  // Disallow dot-dot (directory traversal)
  if (cleaned === ".." || cleaned === ".") return "item";
  if (cleaned.toLowerCase() === ".git") return "git-dir";

  // Disallow trailing periods on Windows/Git filenames (e.g. "foo.")
  cleaned = cleaned.replace(/\.+$/g, "");

  return cleaned || "item";
}

export function cleanGitPath(path: string): string {
  return path
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) => sanitizePathSegment(seg))
    .filter(Boolean)
    .join("/");
}

// --- Base GitHub REST Request Helper ---
export async function githubRequest(
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const cleanToken = token.replace(/^(Bearer|token)\s+/i, "").trim();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `token ${cleanToken}`);
  headers.set("Accept", "application/vnd.github.v3+json");
  if (!headers.has("Content-Type") && options.method && options.method !== "GET" && options.method !== "HEAD") {
    headers.set("Content-Type", "application/json");
  }

  const url = endpoint.startsWith("https://") ? endpoint : `https://api.github.com${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    throw new Error("Invalid GitHub Personal Access Token (401 Unauthorized).");
  }

  return response;
}

// Helper for concurrency controlled tasks
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// --- Repository Validation & Connection Test ---
export async function testGitHubConnection(
  rawConfig: GitHubConfig
): Promise<{ ok: boolean; message: string; user?: string; defaultBranch?: string }> {
  const config = sanitizeGitHubConfig(rawConfig);
  if (!config.token || !config.owner || !config.repo) {
    return { ok: false, message: "Personal Access Token, GitHub Owner, and Repository Name are all required." };
  }

  try {
    const repoPath = `${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
    const res = await githubRequest(config.token, `/repos/${repoPath}`);

    if (res.status === 404) {
      return {
        ok: false,
        message: `Repository "${config.owner}/${config.repo}" was not found or your token lacks permissions.`,
      };
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, message: err.message || `GitHub error: HTTP ${res.status}` };
    }

    const repoInfo = await res.json();
    const defaultBranch = repoInfo.default_branch || "main";

    return {
      ok: true,
      message: `Connected to ${repoInfo.full_name} (${repoInfo.private ? "Private" : "Public"}) • Default branch: "${defaultBranch}"`,
      user: repoInfo.owner?.login,
      defaultBranch,
    };
  } catch (error: any) {
    return { ok: false, message: error.message || "Failed to connect to GitHub." };
  }
}

// --- Markdown Catalog Generator (Privacy-Safe High-Level Analytics & Metrics) ---
export function generateMarkdownReadme(
  bookmarks: EnhancedBookmark[],
  folderMap: Record<string, string>
): string {
  const dateStr = new Date().toLocaleString();
  const total = bookmarks.length;
  const starred = bookmarks.filter((b) => b.isFavorite).length;
  const withScreenshots = bookmarks.filter((b) => b.screenshot || b.githubSha).length;
  const withTags = bookmarks.filter((b) => b.tags && b.tags.length > 0).length;
  const withNotes = bookmarks.filter((b) => b.notes || b.description).length;

  // 1. Group by folder
  const folderCounts: Record<string, { total: number; starred: number }> = {};
  for (const b of bookmarks) {
    const folder = folderMap[b.parentId || ""] || "Bookmarks Bar";
    if (!folderCounts[folder]) folderCounts[folder] = { total: 0, starred: 0 };
    folderCounts[folder].total++;
    if (b.isFavorite) folderCounts[folder].starred++;
  }

  // 2. Domain breakdown
  const domainCounts: Record<string, number> = {};
  for (const b of bookmarks) {
    const domain = getDomain(b.url);
    if (domain && domain !== "unknown") {
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    }
  }
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // 3. Tag breakdown
  const tagCounts: Record<string, number> = {};
  for (const b of bookmarks) {
    for (const t of b.tags || []) {
      const clean = t.trim().toLowerCase();
      if (clean) tagCounts[clean] = (tagCounts[clean] || 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // 4. Health breakdown
  let healthy = 0;
  let redirects = 0;
  let errors = 0;
  let unchecked = 0;
  for (const b of bookmarks) {
    if (!b.httpStatus) {
      unchecked++;
    } else if (b.httpStatus >= 200 && b.httpStatus < 300) {
      healthy++;
    } else if (b.httpStatus >= 300 && b.httpStatus < 400) {
      redirects++;
    } else {
      errors++;
    }
  }

  let md = `# 📑 Personal Bookmarks Vault\n\n`;
  md += `> Automatically synchronized and version-controlled with [Noob31 Bookmark Vault](https://noob31.com)\n\n`;

  md += `### 📊 Vault Overview\n\n`;
  md += `| Metric | Count | Details |\n`;
  md += `| :--- | :---: | :--- |\n`;
  md += `| 🔖 **Total Bookmarks** | **${total}** | Across ${Object.keys(folderCounts).length} folders |\n`;
  md += `| ⭐ **Starred / Favorites** | **${starred}** | ${total > 0 ? Math.round((starred / total) * 100) : 0}% of vault |\n`;
  md += `| 📸 **Visual Snapshots** | **${withScreenshots}** | Saved in \`assets/screenshots/\` |\n`;
  md += `| 🏷️ **Tagged Items** | **${withTags}** | ${Object.keys(tagCounts).length} unique tags |\n`;
  md += `| 📝 **Annotated Notes** | **${withNotes}** | With descriptions/notes |\n`;
  md += `| 🕒 **Last Synchronized** | \`${dateStr}\` | Automated Git snapshot |\n\n`;
  md += `---\n\n`;

  // Folders Table
  md += `### 📁 Folders Distribution\n\n`;
  md += `| Folder Name | Bookmarks | Starred | % Share |\n`;
  md += `| :--- | :---: | :---: | :---: |\n`;
  const sortedFolders = Object.entries(folderCounts).sort((a, b) => b[1].total - a[1].total);
  for (const [folderName, stats] of sortedFolders) {
    const pct = total > 0 ? ((stats.total / total) * 100).toFixed(1) : "0";
    md += `| **${folderName}** | ${stats.total} | ${stats.starred > 0 ? `⭐ ${stats.starred}` : "—"} | ${pct}% |\n`;
  }
  md += `\n---\n\n`;

  // Top Domains & Tags
  md += `### 🌐 Top Domains & 🏷️ Popular Tags\n\n`;
  md += `| Top Domains (${topDomains.length}) | Items | Top Tags (${topTags.length}) | Count |\n`;
  md += `| :--- | :---: | :--- | :---: |\n`;
  const maxRows = Math.max(topDomains.length, topTags.length, 1);
  for (let i = 0; i < maxRows; i++) {
    const d = topDomains[i];
    const t = topTags[i];
    const domainCol = d ? `\`${d[0]}\`` : "—";
    const domainCount = d ? `${d[1]}` : "—";
    const tagCol = t ? `\`#${t[0]}\`` : "—";
    const tagCount = t ? `${t[1]}` : "—";
    md += `| ${domainCol} | ${domainCount} | ${tagCol} | ${tagCount} |\n`;
  }
  md += `\n---\n\n`;

  // Diagnostics & Health
  md += `### 🩺 Link Health Status\n\n`;
  md += `- 🟢 **Healthy (HTTP 200):** ${healthy} links\n`;
  if (redirects > 0) md += `- 🟡 **Redirects (3xx):** ${redirects} links\n`;
  if (errors > 0) md += `- 🔴 **Errors / Dead Links (4xx/5xx):** ${errors} links\n`;
  if (unchecked > 0) md += `- ⚪ **Unchecked / Pending Diagnostics:** ${unchecked} links\n`;
  md += `\n---\n\n`;

  // Repository Guide
  md += `### 🗂️ Repository Architecture\n\n`;
  md += `- **\`.noob31/vault-index.json\`**: Complete structured database for rapid cross-device synchronization and restoration.\n`;
  md += `- **\`bookmarks/\`**: Individual JSON definitions categorized by folder structure.\n`;
  md += `- **\`assets/screenshots/\`**: Viewport snapshots and visual assets for saved pages.\n`;

  return md;
}

// --- Force Commit File via Contents API with Remote SHA Lookup ---
export async function forceCommitFile(
  token: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  commitMessage: string = "update vault file via Noob31 Vault"
): Promise<{ sha: string; commitSha?: string }> {
  let existingSha: string | undefined;
  try {
    const getRes = await githubRequest(token, `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
    if (getRes.ok) {
      const remoteData = await getRes.json();
      existingSha = remoteData.sha;
    }
  } catch {}

  const payload: any = {
    message: commitMessage,
    content: safeB64Encode(content),
    branch,
  };
  if (existingSha) payload.sha = existingSha;

  const res = await githubRequest(token, `/repos/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to commit ${path} (HTTP ${res.status})`);
  }

  const data = await res.json();
  return {
    sha: data.content?.sha || "",
    commitSha: data.commit?.sha || "",
  };
}

export const commitFileContent = forceCommitFile;

// --- Create a Git Blob (for Binary Screenshots or Large Text) ---
async function createGitBlob(
  token: string,
  repo: string,
  content: string,
  encoding: "utf-8" | "base64" = "utf-8"
): Promise<string | null> {
  if (!content) return null;
  let cleanContent = content;
  if (encoding === "base64") {
    if (cleanContent.includes(",")) {
      cleanContent = cleanContent.split(",")[1];
    }
    cleanContent = cleanContent.replace(/[\r\n\s]/g, "");
    if (!cleanContent) return null;
  }

  try {
    const res = await githubRequest(token, `/repos/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: cleanContent, encoding }),
    });
    if (res.ok) {
      const data = await res.json();
      return isValidGitSha(data.sha) ? data.sha : null;
    }
  } catch (err: any) {
    console.warn("Failed to create blob:", err.message || err);
  }
  return null;
}

// --- Fetch Branch Head Commit SHA ---
async function getBranchHeadCommit(
  token: string,
  repo: string,
  branch: string
): Promise<{ sha: string | null; isEmpty: boolean; defaultBranch?: string }> {
  try {
    const res = await githubRequest(token, `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);

    if (res.status === 409) {
      return { sha: null, isEmpty: true };
    }

    if (res.status === 404) {
      // Check if repo has another default branch or is brand new
      const repoRes = await githubRequest(token, `/repos/${repo}`);
      if (repoRes.ok) {
        const repoData = await repoRes.json();
        if (repoData.size === 0) {
          return { sha: null, isEmpty: true, defaultBranch: repoData.default_branch };
        }
        if (repoData.default_branch && repoData.default_branch !== branch) {
          const defaultRefRes = await githubRequest(
            token,
            `/repos/${repo}/git/ref/heads/${encodeURIComponent(repoData.default_branch)}`
          );
          if (defaultRefRes.ok) {
            const defaultRefData = await defaultRefRes.json();
            return {
              sha: defaultRefData.object?.sha || null,
              isEmpty: false,
              defaultBranch: repoData.default_branch,
            };
          }
        }
      }
      return { sha: null, isEmpty: false };
    }

    if (res.ok) {
      const data = await res.json();
      return { sha: data.object?.sha || null, isEmpty: false };
    }
  } catch (err) {
    console.warn("Error fetching branch head commit:", err);
  }
  return { sha: null, isEmpty: false };
}

// --- Push Complete Bookmark Vault to GitHub ---
export async function syncVaultToGitHub(
  rawConfig: GitHubConfig
): Promise<{ success: boolean; message: string; timestamp: number }> {
  const config = sanitizeGitHubConfig(rawConfig);
  if (!config.token || !config.owner || !config.repo) {
    return {
      success: false,
      message: "Personal Access Token, Owner, and Repository name are all required.",
      timestamp: Date.now(),
    };
  }

  const repoPath = `${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  await saveGitHubConfig({ ...config, syncStatus: "syncing", lastSyncError: undefined });

  try {
    const tree = await getEnhancedBookmarkTree();
    const flatList = extractAllBookmarks(tree);
    const folderTree = extractFolderTree(tree);
    const metadata = await getAllMetadata();

    // 1. Check branch head commit SHA
    let { sha: parentCommitSha, isEmpty } = await getBranchHeadCommit(config.token, repoPath, config.branch);

    // 2. Map folder IDs to clean paths
    const folderMap: Record<string, string> = {};
    function buildFolderMap(nodes: FolderNode[], prefix = "") {
      for (const n of nodes) {
        const segment = sanitizePathSegment(n.title);
        const fullPath = prefix ? `${prefix}/${segment}` : segment;
        folderMap[n.id] = fullPath;
        if (n.children) buildFolderMap(n.children, fullPath);
      }
    }
    buildFolderMap(folderTree);

    // 3. Inspect parent tree to discover existing blobs and preserve non-vault files (.github, LICENSE, etc.)
    const existingRemoteBlobs = new Map<string, string>();
    const preservedNonVaultItems: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
    if (parentCommitSha && isValidGitSha(parentCommitSha)) {
      try {
        const commitRes = await githubRequest(config.token, `/repos/${repoPath}/git/commits/${parentCommitSha}`);
        if (commitRes.ok) {
          const commitData = await commitRes.json();
          const baseTreeSha = commitData.tree?.sha;
          if (baseTreeSha && isValidGitSha(baseTreeSha)) {
            const treeRes = await githubRequest(
              config.token,
              `/repos/${repoPath}/git/trees/${baseTreeSha}?recursive=1`
            );
            if (treeRes.ok) {
              const baseTreeData = await treeRes.json();
              for (const item of baseTreeData.tree || []) {
                if (item.type === "blob" && isValidGitSha(item.sha)) {
                  const cleanedPath = cleanGitPath(item.path);
                  existingRemoteBlobs.set(cleanedPath, item.sha);
                  if (
                    !cleanedPath.startsWith("bookmarks/") &&
                    !cleanedPath.startsWith("assets/") &&
                    !cleanedPath.startsWith(".noob31/") &&
                    cleanedPath !== "README.md" &&
                    cleanedPath !== "bookmarks-vault.json"
                  ) {
                    preservedNonVaultItems.push({
                      path: cleanedPath,
                      mode: "100644",
                      type: "blob",
                      sha: item.sha,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("Could not inspect parent tree for non-vault items", err);
      }
    }

    // 4. Build Git Tree Items
    const treeMap = new Map<
      string,
      {
        path: string;
        mode: "100644";
        type: "blob";
        content?: string;
        sha?: string;
      }
    >();

    // Prepare screenshot blob uploads (skip anything already present in local cache OR in remote Git tree)
    const metadataUpdatesToPersist: Record<string, Partial<BookmarkMetadata>> = {};
    const screenshotUploadTasks: Array<{ id: string; assetPath: string; base64: string }> = [];

    for (const b of flatList) {
      if (b.screenshot && b.screenshot.startsWith("data:image/")) {
        const assetPath = cleanGitPath(`assets/screenshots/${b.id}.webp`);
        const knownSha = (b.githubSha && isValidGitSha(b.githubSha))
          ? b.githubSha
          : existingRemoteBlobs.get(assetPath);

        if (knownSha && isValidGitSha(knownSha)) {
          // Already uploaded to Git! Reuse SHA directly with zero network blob upload overhead
          treeMap.set(assetPath, {
            path: assetPath,
            mode: "100644",
            type: "blob",
            sha: knownSha,
          });
          if (b.githubSha !== knownSha) {
            metadataUpdatesToPersist[b.id] = { githubSha: knownSha };
          }
        } else {
          const base64Data = b.screenshot.split(",")[1];
          if (base64Data) {
            screenshotUploadTasks.push({
              id: b.id,
              assetPath,
              base64: base64Data,
            });
          }
        }
      }
    }

    // Upload only genuinely new/unseen screenshots concurrently
    if (screenshotUploadTasks.length > 0) {
      await runWithConcurrency(screenshotUploadTasks, 5, async (task) => {
        try {
          const blobSha = await createGitBlob(config.token, repoPath, task.base64, "base64");
          if (blobSha && isValidGitSha(blobSha)) {
            treeMap.set(task.assetPath, {
              path: task.assetPath,
              mode: "100644",
              type: "blob",
              sha: blobSha,
            });
            metadataUpdatesToPersist[task.id] = { githubSha: blobSha };
          }
        } catch (blobErr) {
          console.warn(`Screenshot upload skipped for bookmark ${task.id}:`, blobErr);
        }
      });
    }

    // Persist all newly discovered/created blob SHAs in local storage in a single atomic batch
    if (Object.keys(metadataUpdatesToPersist).length > 0) {
      await bulkUpdateMetadata(metadataUpdatesToPersist);
    }

    // Clean metadata and bookmarks for cloud storage: replace large data URL screenshots with asset path references
    const cloudMetadata: Record<string, BookmarkMetadata> = {};
    for (const [id, meta] of Object.entries(metadata)) {
      const assetPath = `assets/screenshots/${id}.webp`;
      const assignedSha =
        metadataUpdatesToPersist[id]?.githubSha ||
        meta.githubSha ||
        existingRemoteBlobs.get(assetPath);

      cloudMetadata[id] = {
        ...meta,
        screenshot: meta.screenshot ? assetPath : undefined,
        githubSha: assignedSha,
      };
    }

    const cloudBookmarks = flatList.map((b) => {
      const assetPath = `assets/screenshots/${b.id}.webp`;
      const assignedSha =
        metadataUpdatesToPersist[b.id]?.githubSha ||
        b.githubSha ||
        existingRemoteBlobs.get(assetPath);

      return {
        id: b.id,
        parentId: b.parentId,
        folderPath: folderMap[b.parentId || ""] || "Bookmarks Bar",
        title: b.title,
        url: b.url,
        domain: getDomain(b.url),
        dateAdded: b.dateAdded,
        tags: b.tags || [],
        description: b.description || "",
        notes: b.notes || "",
        httpStatus: b.httpStatus,
        httpStatusText: b.httpStatusText,
        finalUrl: b.finalUrl,
        isFavorite: b.isFavorite || false,
        favicon: b.favicon,
        ogImage: b.ogImage,
        screenshot: b.screenshot ? assetPath : undefined,
        githubSha: assignedSha,
        lastChecked: b.lastChecked,
      };
    });

    // Complete snapshot index (clean, lightweight JSON)
    const vaultIndex = {
      version: "2.1.0",
      syncedAt: new Date().toISOString(),
      bookmarkCount: flatList.length,
      folderMap,
      folderTree,
      bookmarks: cloudBookmarks,
      metadata: cloudMetadata,
    };

    treeMap.set(".noob31/vault-index.json", {
      path: ".noob31/vault-index.json",
      mode: "100644",
      type: "blob",
      content: JSON.stringify(vaultIndex, null, 2),
    });

    // Catalog README
    const readmeContent = generateMarkdownReadme(flatList, folderMap);
    treeMap.set("README.md", {
      path: "README.md",
      mode: "100644",
      type: "blob",
      content: readmeContent,
    });

    // Bookmark JSON entries
    for (const b of flatList) {
      const folderPath = folderMap[b.parentId || ""] || "Bookmarks Bar";
      const cleanFolder = folderPath.split("/").map(sanitizePathSegment).filter(Boolean).join("/") || "Bookmarks Bar";
      const fileSlug = sanitizePathSegment(b.title || b.id).slice(0, 50);
      const filePath = cleanGitPath(`bookmarks/${cleanFolder}/${fileSlug}_${b.id}.json`);
      const assetPath = `assets/screenshots/${b.id}.webp`;
      const assignedSha =
        metadataUpdatesToPersist[b.id]?.githubSha ||
        b.githubSha ||
        existingRemoteBlobs.get(assetPath);

      const cleanBookmark = {
        id: b.id,
        parentId: b.parentId,
        folderPath,
        title: b.title,
        url: b.url,
        domain: getDomain(b.url),
        dateAdded: b.dateAdded,
        tags: b.tags || [],
        description: b.description || "",
        notes: b.notes || "",
        httpStatus: b.httpStatus,
        httpStatusText: b.httpStatusText,
        finalUrl: b.finalUrl,
        isFavorite: b.isFavorite || false,
        favicon: b.favicon,
        ogImage: b.ogImage,
        screenshot: b.screenshot ? assetPath : undefined,
        githubSha: assignedSha,
        lastChecked: b.lastChecked,
      };

      treeMap.set(filePath, {
        path: filePath,
        mode: "100644",
        type: "blob",
        content: JSON.stringify(cleanBookmark, null, 2),
      });
    }

    // Preserve non-vault items
    for (const item of preservedNonVaultItems) {
      if (!treeMap.has(item.path)) {
        treeMap.set(item.path, item as any);
      }
    }

    const treeItems = Array.from(treeMap.values());

    // 5. Create Git Tree
    const createTreeRes = await githubRequest(config.token, `/repos/${repoPath}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ tree: treeItems }),
    });

    if (!createTreeRes.ok) {
      const errData = await createTreeRes.json().catch(() => ({}));
      const detailedMsg = errData.message || (errData.errors ? JSON.stringify(errData.errors) : `HTTP ${createTreeRes.status}`);
      console.warn(`Git Tree API failed (${createTreeRes.status}): ${detailedMsg}, falling back to Contents API...`);

      // Robust fallback: commit main vault index & README directly via Contents API
      await forceCommitFile(
        config.token,
        repoPath,
        config.branch,
        ".noob31/vault-index.json",
        JSON.stringify(vaultIndex, null, 2),
        `[Vault Sync] Synchronized ${flatList.length} bookmarks`
      );

      await forceCommitFile(
        config.token,
        repoPath,
        config.branch,
        "README.md",
        readmeContent,
        `[Vault Sync] Update Catalog README`
      );

      const timestamp = Date.now();
      await saveGitHubConfig({
        ...config,
        syncStatus: "success",
        lastSyncTime: timestamp,
        lastSyncError: undefined,
      });

      return {
        success: true,
        message: `Pushed ${flatList.length} bookmarks to ${config.owner}/${config.repo}!`,
        timestamp,
      };
    }

    const treeData = await createTreeRes.json();
    const newTreeSha = treeData.sha;

    // 6. Create Git Commit
    const commitPayload: any = {
      message: `[Vault Sync] Synchronized ${flatList.length} bookmarks across ${Object.keys(folderMap).length} folders (${new Date().toLocaleDateString()})`,
      tree: newTreeSha,
    };
    if (isValidGitSha(parentCommitSha)) {
      commitPayload.parents = [parentCommitSha];
    } else {
      commitPayload.parents = [];
    }

    const createCommitRes = await githubRequest(config.token, `/repos/${repoPath}/git/commits`, {
      method: "POST",
      body: JSON.stringify(commitPayload),
    });

    if (!createCommitRes.ok) {
      const errData = await createCommitRes.json().catch(() => ({}));
      throw new Error(`Commit creation failed (${createCommitRes.status}): ${errData.message || createCommitRes.statusText}`);
    }
    const commitData = await createCommitRes.json();
    const newCommitSha = commitData.sha;

    // 7. Update Branch Ref
    const targetBranch = config.branch || "main";
    let updateRefRes = await githubRequest(
      config.token,
      `/repos/${repoPath}/git/refs/heads/${encodeURIComponent(targetBranch)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ sha: newCommitSha, force: true }),
      }
    );

    if (updateRefRes.status === 404) {
      const createRefRes = await githubRequest(config.token, `/repos/${repoPath}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${targetBranch}`, sha: newCommitSha }),
      });

      if (!createRefRes.ok) {
        const errData = await createRefRes.json().catch(() => ({}));
        throw new Error(`Failed to create branch "${targetBranch}" (${createRefRes.status}): ${errData.message || createRefRes.statusText}`);
      }
    } else if (!updateRefRes.ok) {
      const errData = await updateRefRes.json().catch(() => ({}));
      throw new Error(`Failed to update branch "${targetBranch}" (${updateRefRes.status}): ${errData.message || updateRefRes.statusText}`);
    }

    const timestamp = Date.now();
    await saveGitHubConfig({
      ...config,
      syncStatus: "success",
      lastSyncTime: timestamp,
      lastSyncError: undefined,
    });

    return {
      success: true,
      message: `Successfully pushed ${flatList.length} bookmarks & assets to ${config.owner}/${config.repo}!`,
      timestamp,
    };
  } catch (err: any) {
    const errorMsg = err.message || "Failed to sync to GitHub";
    await saveGitHubConfig({
      ...config,
      syncStatus: "error",
      lastSyncError: errorMsg,
    });
    return {
      success: false,
      message: errorMsg,
      timestamp: Date.now(),
    };
  }
}

// --- Helper to ensure nested Chrome folder paths exist ---
export async function ensureChromeFolderPath(folderPath?: string): Promise<string> {
  if (!folderPath || folderPath === "Bookmarks Bar" || folderPath === "bookmarks_bar") {
    return "1";
  }

  const rawSegments = folderPath
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawSegments.length === 0) return "1";

  let currentParentId = "1";
  let startIndex = 0;

  const firstSegLower = rawSegments[0].toLowerCase();
  if (
    firstSegLower === "bookmarks bar" ||
    firstSegLower === "bookmark bar" ||
    firstSegLower === "bookmarks_bar"
  ) {
    currentParentId = "1";
    startIndex = 1;
  } else if (
    firstSegLower === "other bookmarks" ||
    firstSegLower === "other_bookmarks" ||
    firstSegLower === "other"
  ) {
    currentParentId = "2";
    startIndex = 1;
  }

  if (typeof chrome === "undefined" || !chrome.bookmarks) {
    return "1";
  }

  for (let i = startIndex; i < rawSegments.length; i++) {
    const segmentName = rawSegments[i];
    try {
      const children: chrome.bookmarks.BookmarkTreeNode[] = await new Promise((resolve) => {
        chrome.bookmarks.getChildren(currentParentId, (nodes) => {
          resolve(nodes || []);
        });
      });

      const matchingFolder = children.find(
        (n) => !n.url && n.title.trim().toLowerCase() === segmentName.toLowerCase()
      );

      if (matchingFolder) {
        currentParentId = matchingFolder.id;
      } else {
        const created = await new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve, reject) => {
          chrome.bookmarks.create(
            { parentId: currentParentId, title: segmentName },
            (node) => {
              if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
              else resolve(node);
            }
          );
        });
        currentParentId = created.id;
      }
    } catch {
      break;
    }
  }

  return currentParentId;
}

interface RemoteVaultPackage {
  vaultIndex: any | null;
  treeItems: Array<{ path: string; mode: string; type: string; sha: string }>;
  screenshotBlobsByPath: Map<string, string>;
  screenshotBlobsById: Map<string, string>;
}

// --- Fetch Complete Remote Vault Package (Index, Tree, Screenshots) ---
async function fetchRemoteVaultPackage(config: GitHubConfig): Promise<RemoteVaultPackage | null> {
  const repoPath = `${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;

  // 1. Get branch head commit
  const { sha: branchSha, isEmpty } = await getBranchHeadCommit(config.token, repoPath, config.branch);
  if (isEmpty || !branchSha) {
    return null;
  }

  let treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
  try {
    const commitRes = await githubRequest(config.token, `/repos/${repoPath}/git/commits/${branchSha}`);
    if (commitRes.ok) {
      const commitData = await commitRes.json();
      const treeSha = commitData.tree?.sha;
      if (treeSha && isValidGitSha(treeSha)) {
        const treeRes = await githubRequest(
          config.token,
          `/repos/${repoPath}/git/trees/${treeSha}?recursive=1`
        );
        if (treeRes.ok) {
          const treeData = await treeRes.json();
          treeItems = treeData.tree || [];
        }
      }
    }
  } catch (err) {
    console.warn("Could not fetch remote Git tree:", err);
  }

  const screenshotBlobsByPath = new Map<string, string>();
  const screenshotBlobsById = new Map<string, string>();

  for (const item of treeItems) {
    if (item.type === "blob" && isValidGitSha(item.sha)) {
      const cleanPath = cleanGitPath(item.path);
      if (cleanPath.startsWith("assets/screenshots/")) {
        screenshotBlobsByPath.set(cleanPath, item.sha);
        const filename = cleanPath.split("/").pop() || "";
        const idMatch = filename.replace(/\.webp$/i, "").match(/(?:_|^)([0-9a-zA-Z_-]+)$/);
        if (idMatch && idMatch[1]) {
          screenshotBlobsById.set(idMatch[1], item.sha);
        }
      }
    }
  }

  // 2. Fetch Vault Index
  let vaultIndex: any = null;

  // A. Check for index in tree
  const indexItem = treeItems.find(
    (i) =>
      i.type === "blob" &&
      (i.path === ".noob31/vault-index.json" ||
        i.path === "bookmarks-vault.json" ||
        cleanGitPath(i.path) === ".noob31/vault-index.json")
  );

  if (indexItem && isValidGitSha(indexItem.sha)) {
    try {
      const blobRes = await githubRequest(config.token, `/repos/${repoPath}/git/blobs/${indexItem.sha}`);
      if (blobRes.ok) {
        const blobData = await blobRes.json();
        if (blobData.content) {
          const jsonText = safeB64Decode(blobData.content);
          vaultIndex = JSON.parse(jsonText);
        }
      }
    } catch (err) {
      console.warn("Could not read vault index blob:", err);
    }
  }

  // B. Contents API fallback
  if (!vaultIndex) {
    const targetPaths = [`.noob31/vault-index.json`, `bookmarks-vault.json`];
    for (const filePath of targetPaths) {
      try {
        const res = await githubRequest(
          config.token,
          `/repos/${repoPath}/contents/${filePath}?ref=${encodeURIComponent(config.branch)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.content) {
            const jsonStr = safeB64Decode(data.content);
            vaultIndex = JSON.parse(jsonStr);
            break;
          } else if (data.download_url) {
            const dlRes = await githubRequest(config.token, data.download_url);
            if (dlRes.ok) {
              vaultIndex = await dlRes.json();
              break;
            }
          }
        }
      } catch {}
    }
  }

  // C. Fallback: Reconstruct from individual bookmarks/*.json files
  if (!vaultIndex && treeItems.length > 0) {
    const bookmarkNodes = treeItems.filter(
      (item) => item.path?.startsWith("bookmarks/") && item.path?.endsWith(".json") && item.type === "blob"
    );

    if (bookmarkNodes.length > 0) {
      const restoredBookmarks: EnhancedBookmark[] = [];
      const restoredMetadata: Record<string, BookmarkMetadata> = {};

      await runWithConcurrency(bookmarkNodes, 6, async (node) => {
        try {
          const bRes = await githubRequest(config.token, `/repos/${repoPath}/git/blobs/${node.sha}`);
          if (bRes.ok) {
            const blobData = await bRes.json();
            const text = safeB64Decode(blobData.content);
            const bm = JSON.parse(text);
            restoredBookmarks.push(bm);
            if (bm.id) {
              restoredMetadata[bm.id] = {
                tags: bm.tags,
                description: bm.description,
                notes: bm.notes,
                isFavorite: bm.isFavorite,
                httpStatus: bm.httpStatus,
                httpStatusText: bm.httpStatusText,
                finalUrl: bm.finalUrl,
                favicon: bm.favicon,
                ogImage: bm.ogImage,
                screenshot: bm.screenshot,
                githubSha: bm.githubSha,
              };
            }
          }
        } catch {}
      });

      if (restoredBookmarks.length > 0) {
        vaultIndex = {
          version: "2.1.0",
          syncedAt: new Date().toISOString(),
          bookmarkCount: restoredBookmarks.length,
          bookmarks: restoredBookmarks,
          metadata: restoredMetadata,
        };
      }
    }
  }

  return {
    vaultIndex,
    treeItems,
    screenshotBlobsByPath,
    screenshotBlobsById,
  };
}

function normalizeBookmarkUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.trim());
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

// --- Pull & Restore Bookmarks, Folders, Metadata & Screenshots from GitHub ---
export async function pullVaultFromGitHub(
  rawConfig: GitHubConfig,
  options: { restoreBookmarks?: boolean } = { restoreBookmarks: true }
): Promise<{ success: boolean; message: string; count: number }> {
  const config = sanitizeGitHubConfig(rawConfig);
  if (!config.token || !config.owner || !config.repo) {
    return {
      success: false,
      message: "Personal Access Token, Owner, and Repository are required.",
      count: 0,
    };
  }

  const repoPath = `${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  await saveGitHubConfig({ ...config, syncStatus: "syncing", lastSyncError: undefined });

  try {
    const remoteData = await fetchRemoteVaultPackage(config);
    if (!remoteData || !remoteData.vaultIndex) {
      const msg = `No bookmark vault found in "${config.owner}/${config.repo}" on branch "${config.branch}".`;
      await saveGitHubConfig({ ...config, syncStatus: "error", lastSyncError: msg });
      return { success: false, message: msg, count: 0 };
    }

    const { vaultIndex, screenshotBlobsByPath, screenshotBlobsById } = remoteData;
    const localTree = await getEnhancedBookmarkTree();
    const localBookmarks = extractAllBookmarks(localTree);
    const localMetadata = await getAllMetadata();

    const urlToLocalBookmark = new Map<string, EnhancedBookmark>();
    for (const b of localBookmarks) {
      if (b.url) {
        urlToLocalBookmark.set(normalizeBookmarkUrl(b.url), b);
      }
    }

    const remoteBookmarks: any[] =
      vaultIndex.bookmarks || (vaultIndex.tree ? extractAllBookmarks(vaultIndex.tree) : []);
    const remoteMetadata: Record<string, BookmarkMetadata> = vaultIndex.metadata || {};
    const remoteFolderMap: Record<string, string> = vaultIndex.folderMap || {};

    let createdCount = 0;
    let updatedCount = 0;
    let downloadedImagesCount = 0;
    const metadataUpdates: Record<string, Partial<BookmarkMetadata>> = {};
    const imageDownloadTasks: Array<{ targetId: string; blobSha: string }> = [];

    // 1. Reconcile Bookmarks (Restore missing to Chrome + map to local target)
    const reconciledItems: Array<{ targetId: string; remoteBm: any; remoteMeta: BookmarkMetadata }> = [];

    for (const rb of remoteBookmarks) {
      if (!rb.url) continue;
      const normalizedUrl = normalizeBookmarkUrl(rb.url);
      let targetLocal = urlToLocalBookmark.get(normalizedUrl);
      const remoteMeta = remoteMetadata[rb.id] || {};

      // Restore bookmark into Chrome with proper folder structure if missing
      if (!targetLocal && options.restoreBookmarks) {
        try {
          const folderPath =
            rb.folderPath ||
            (rb.parentId && remoteFolderMap[rb.parentId]) ||
            "Bookmarks Bar";

          const parentId = await ensureChromeFolderPath(folderPath);

          const created = await createBookmark({
            parentId,
            title: rb.title || rb.url,
            url: rb.url,
            tags: rb.tags || remoteMeta.tags || [],
            description: rb.description || remoteMeta.description || "",
            notes: rb.notes || remoteMeta.notes || "",
            isFavorite: rb.isFavorite || remoteMeta.isFavorite || false,
            favicon: rb.favicon || remoteMeta.favicon,
            ogImage: rb.ogImage || remoteMeta.ogImage,
            readerContent: rb.readerContent || remoteMeta.readerContent,
          });

          targetLocal = created;
          urlToLocalBookmark.set(normalizedUrl, created);
          createdCount++;
        } catch (createErr) {
          console.warn(`Could not restore bookmark ${rb.url}:`, createErr);
        }
      }

      if (targetLocal) {
        reconciledItems.push({
          targetId: targetLocal.id,
          remoteBm: rb,
          remoteMeta,
        });
      }
    }

    // 2. Identify and Download Screenshot Images
    for (const item of reconciledItems) {
      const { targetId, remoteBm, remoteMeta } = item;
      const assetPath = cleanGitPath(remoteBm.screenshot || `assets/screenshots/${remoteBm.id}.webp`);

      const targetBlobSha =
        (isValidGitSha(remoteBm.githubSha) ? remoteBm.githubSha : undefined) ||
        (isValidGitSha(remoteMeta.githubSha) ? remoteMeta.githubSha : undefined) ||
        screenshotBlobsById.get(remoteBm.id) ||
        screenshotBlobsByPath.get(assetPath);

      const existingLocal = localMetadata[targetId] || {};

      if (targetBlobSha && isValidGitSha(targetBlobSha)) {
        // Check if we already have this exact screenshot locally
        const hasMatchingLocalImage =
          existingLocal.screenshot &&
          existingLocal.screenshot.startsWith("data:image/") &&
          existingLocal.githubSha === targetBlobSha;

        if (!hasMatchingLocalImage) {
          imageDownloadTasks.push({
            targetId,
            blobSha: targetBlobSha,
          });
        }
      }
    }

    const downloadedImages = new Map<string, { dataUrl: string; sha: string }>();

    if (imageDownloadTasks.length > 0) {
      await runWithConcurrency(imageDownloadTasks, 6, async (task) => {
        try {
          const res = await githubRequest(config.token, `/repos/${repoPath}/git/blobs/${task.blobSha}`);
          if (res.ok) {
            const data = await res.json();
            if (data.content) {
              const cleanBase64 = data.content.replace(/\s/g, "");
              const dataUrl = `data:image/webp;base64,${cleanBase64}`;
              downloadedImages.set(task.targetId, {
                dataUrl,
                sha: task.blobSha,
              });
              downloadedImagesCount++;
            }
          }
        } catch (imgErr) {
          console.warn(`Could not download image blob for bookmark ${task.targetId}:`, imgErr);
        }
      });
    }

    // 3. Merge All Metadata Fields (Tags, Notes, Diagnostics, Stars, Screenshots)
    for (const item of reconciledItems) {
      const { targetId, remoteBm, remoteMeta } = item;
      const existingLocal = localMetadata[targetId] || {};
      const downloaded = downloadedImages.get(targetId);

      const mergedTags = Array.from(
        new Set([
          ...(existingLocal.tags || []),
          ...(remoteBm.tags || []),
          ...(remoteMeta.tags || []),
        ])
      ).filter(Boolean);

      const finalScreenshot =
        downloaded?.dataUrl ||
        (existingLocal.screenshot && existingLocal.screenshot.startsWith("data:image/")
          ? existingLocal.screenshot
          : undefined);

      const finalSha =
        downloaded?.sha ||
        (isValidGitSha(remoteBm.githubSha) ? remoteBm.githubSha : undefined) ||
        (isValidGitSha(remoteMeta.githubSha) ? remoteMeta.githubSha : undefined) ||
        (isValidGitSha(existingLocal.githubSha) ? existingLocal.githubSha : undefined);

      metadataUpdates[targetId] = {
        ...existingLocal,
        tags: mergedTags,
        description: remoteBm.description || remoteMeta.description || existingLocal.description,
        notes: remoteBm.notes || remoteMeta.notes || existingLocal.notes,
        isFavorite: remoteBm.isFavorite ?? remoteMeta.isFavorite ?? existingLocal.isFavorite,
        favicon: remoteBm.favicon || remoteMeta.favicon || existingLocal.favicon,
        ogImage: remoteBm.ogImage || remoteMeta.ogImage || existingLocal.ogImage,
        readerContent: remoteBm.readerContent || remoteMeta.readerContent || existingLocal.readerContent,
        httpStatus: remoteBm.httpStatus || remoteMeta.httpStatus || existingLocal.httpStatus,
        httpStatusText: remoteBm.httpStatusText || remoteMeta.httpStatusText || existingLocal.httpStatusText,
        finalUrl: remoteBm.finalUrl || remoteMeta.finalUrl || existingLocal.finalUrl,
        lastChecked: remoteBm.lastChecked || remoteMeta.lastChecked || existingLocal.lastChecked,
        screenshot: finalScreenshot,
        githubSha: finalSha,
        lastCaptured: finalScreenshot ? (existingLocal.lastCaptured || Date.now()) : undefined,
      };

      updatedCount++;
    }

    // Preserve any metadata entries for non-matching local bookmarks
    for (const [metaId, meta] of Object.entries(remoteMetadata)) {
      if (!metadataUpdates[metaId] && !localMetadata[metaId]) {
        metadataUpdates[metaId] = meta;
      }
    }

    // 4. Batch Atomic Storage Update
    if (Object.keys(metadataUpdates).length > 0) {
      await bulkUpdateMetadata(metadataUpdates);
    }

    const timestamp = Date.now();
    await saveGitHubConfig({
      ...config,
      syncStatus: "success",
      lastSyncTime: timestamp,
      lastSyncError: undefined,
    });

    const parts: string[] = [];
    if (createdCount > 0) parts.push(`restored ${createdCount} bookmarks`);
    if (updatedCount > 0) parts.push(`synced metadata for ${updatedCount} items`);
    if (downloadedImagesCount > 0) parts.push(`downloaded ${downloadedImagesCount} screenshots`);

    const summaryMsg = parts.length > 0
      ? `Vault successfully pulled from GitHub (${parts.join(", ")})!`
      : `Vault is up to date with GitHub (${reconciledItems.length} bookmarks verified).`;

    return {
      success: true,
      message: summaryMsg,
      count: createdCount + updatedCount,
    };
  } catch (err: any) {
    const errorMsg = err.message || "Failed to restore from GitHub";
    await saveGitHubConfig({
      ...config,
      syncStatus: "error",
      lastSyncError: errorMsg,
    });
    return {
      success: false,
      message: errorMsg,
      count: 0,
    };
  }
}
