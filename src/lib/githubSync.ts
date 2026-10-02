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
  return (name || "untitled")
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "") // Strip all invisible control characters
    .replace(/[/\\?%*:|"<>]/g, "-") // Replace forbidden path chars
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/^\.+|\.+$/g, "") // Strip leading/trailing periods
    .replace(/^ +| +$/g, "") // Strip leading/trailing spaces
    .trim() || "item";
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

    // 3. Inspect parent tree to preserve non-vault files (.github, LICENSE, .gitignore)
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
                if (
                  item.type === "blob" &&
                  isValidGitSha(item.sha) &&
                  !item.path.startsWith("bookmarks/") &&
                  !item.path.startsWith("assets/") &&
                  !item.path.startsWith(".noob31/") &&
                  item.path !== "README.md" &&
                  item.path !== "bookmarks-vault.json"
                ) {
                  preservedNonVaultItems.push({
                    path: cleanGitPath(item.path),
                    mode: "100644",
                    type: "blob",
                    sha: item.sha,
                  });
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

    // Clean metadata and bookmarks for cloud storage: replace large data URL screenshots with asset path references
    const cloudMetadata: Record<string, BookmarkMetadata> = {};
    for (const [id, meta] of Object.entries(metadata)) {
      cloudMetadata[id] = {
        ...meta,
        screenshot: meta.screenshot ? `assets/screenshots/${id}.webp` : undefined,
      };
    }

    const cloudBookmarks = flatList.map((b) => ({
      id: b.id,
      parentId: b.parentId,
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
      screenshot: b.screenshot ? `assets/screenshots/${b.id}.webp` : undefined,
      githubSha: b.githubSha,
      lastChecked: b.lastChecked,
    }));

    // Complete snapshot index (clean, lightweight JSON)
    const vaultIndex = {
      version: "2.1.0",
      syncedAt: new Date().toISOString(),
      bookmarkCount: flatList.length,
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

    // Bookmark JSON entries & Screenshot blobs
    const screenshotUploadTasks: Array<{ id: string; base64: string; existingSha?: string }> = [];

    for (const b of flatList) {
      const folderPath = folderMap[b.parentId || ""] || "Bookmarks Bar";
      const cleanFolder = folderPath.split("/").map(sanitizePathSegment).filter(Boolean).join("/") || "Bookmarks Bar";
      const fileSlug = sanitizePathSegment(b.title || b.id).slice(0, 50);
      const filePath = cleanGitPath(`bookmarks/${cleanFolder}/${fileSlug}_${b.id}.json`);

      const cleanBookmark = {
        id: b.id,
        parentId: b.parentId,
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
        screenshot: b.screenshot ? `assets/screenshots/${b.id}.webp` : undefined,
        lastChecked: b.lastChecked,
      };

      treeMap.set(filePath, {
        path: filePath,
        mode: "100644",
        type: "blob",
        content: JSON.stringify(cleanBookmark, null, 2),
      });

      if (b.screenshot && b.screenshot.startsWith("data:image/")) {
        const base64Data = b.screenshot.split(",")[1];
        if (base64Data) {
          screenshotUploadTasks.push({
            id: b.id,
            base64: base64Data,
            existingSha: b.githubSha,
          });
        }
      }
    }

    // Upload screenshot blobs concurrently
    if (screenshotUploadTasks.length > 0) {
      await runWithConcurrency(screenshotUploadTasks, 5, async (task) => {
        try {
          const validExistingSha = isValidGitSha(task.existingSha) ? task.existingSha : undefined;
          const blobSha =
            validExistingSha ||
            (await createGitBlob(config.token, repoPath, task.base64, "base64"));
          if (blobSha && isValidGitSha(blobSha)) {
            const assetPath = cleanGitPath(`assets/screenshots/${task.id}.webp`);
            treeMap.set(assetPath, {
              path: assetPath,
              mode: "100644",
              type: "blob",
              sha: blobSha,
            });
            if (!validExistingSha) {
              await saveBookmarkMetadata(task.id, { githubSha: blobSha });
            }
          }
        } catch (blobErr) {
          console.warn(`Screenshot upload skipped for bookmark ${task.id}:`, blobErr);
        }
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
      const fallbackCommit = await forceCommitFile(
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

// --- Fetch Raw Vault Index from GitHub (Supports large files & Blob fallback) ---
async function fetchRawVaultIndex(config: GitHubConfig): Promise<any | null> {
  const repoPath = `${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const targetPaths = [`.noob31/vault-index.json`, `bookmarks-vault.json`];

  for (const filePath of targetPaths) {
    try {
      const res = await githubRequest(
        config.token,
        `/repos/${repoPath}/contents/${filePath}?ref=${encodeURIComponent(config.branch)}`
      );

      if (res.ok) {
        const data = await res.json();
        // 1. Direct Base64 content
        if (data.content) {
          const jsonStr = safeB64Decode(data.content);
          return JSON.parse(jsonStr);
        }

        // 2. Large file Git Blob API
        if (data.sha) {
          const blobRes = await githubRequest(config.token, `/repos/${repoPath}/git/blobs/${data.sha}`);
          if (blobRes.ok) {
            const blobData = await blobRes.json();
            if (blobData.content) {
              const rawText = safeB64Decode(blobData.content);
              return JSON.parse(rawText);
            }
          }
        }

        // 3. Download URL
        if (data.download_url) {
          const downloadRes = await githubRequest(config.token, data.download_url);
          if (downloadRes.ok) {
            return await downloadRes.json();
          }
        }
      }
    } catch (err) {
      console.warn(`Could not read ${filePath}:`, err);
    }
  }

  // 4. Fallback: Reconstruct from Git Tree
  try {
    const { sha: branchSha } = await getBranchHeadCommit(config.token, repoPath, config.branch);
    if (branchSha) {
      const commitRes = await githubRequest(config.token, `/repos/${repoPath}/git/commits/${branchSha}`);
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        const treeSha = commitData.tree?.sha;
        if (treeSha) {
          const treeRes = await githubRequest(
            config.token,
            `/repos/${repoPath}/git/trees/${treeSha}?recursive=1`
          );
          if (treeRes.ok) {
            const treeData = await treeRes.json();
            const bookmarkNodes = (treeData.tree || []).filter(
              (item: any) =>
                item.path?.startsWith("bookmarks/") && item.path?.endsWith(".json") && item.type === "blob"
            );

            if (bookmarkNodes.length > 0) {
              const restoredBookmarks: EnhancedBookmark[] = [];
              const restoredMetadata: Record<string, BookmarkMetadata> = {};

              await runWithConcurrency(bookmarkNodes, 6, async (node: any) => {
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
                      };
                    }
                  }
                } catch {}
              });

              if (restoredBookmarks.length > 0) {
                return {
                  version: "2.1.0",
                  syncedAt: new Date().toISOString(),
                  bookmarkCount: restoredBookmarks.length,
                  bookmarks: restoredBookmarks,
                  metadata: restoredMetadata,
                };
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("Tree reconstruction fallback error:", err);
  }

  return null;
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

// --- Pull & Restore Bookmarks & Metadata from GitHub ---
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

  try {
    const vault = await fetchRawVaultIndex(config);
    if (!vault) {
      return {
        success: false,
        message: `No vault records found in "${config.owner}/${config.repo}" on branch "${config.branch}".`,
        count: 0,
      };
    }

    const localTree = await getEnhancedBookmarkTree();
    const localBookmarks = extractAllBookmarks(localTree);

    const urlToLocalBookmark = new Map<string, EnhancedBookmark>();
    for (const b of localBookmarks) {
      if (b.url) {
        urlToLocalBookmark.set(normalizeBookmarkUrl(b.url), b);
      }
    }

    const remoteBookmarks: EnhancedBookmark[] =
      vault.bookmarks || (vault.tree ? extractAllBookmarks(vault.tree) : []);
    const remoteMetadata: Record<string, BookmarkMetadata> = vault.metadata || {};

    let createdCount = 0;
    let updatedCount = 0;
    const metadataUpdates: Record<string, Partial<BookmarkMetadata>> = {};

    for (const rb of remoteBookmarks) {
      if (!rb.url) continue;
      const normalizedUrl = normalizeBookmarkUrl(rb.url);
      let targetLocal = urlToLocalBookmark.get(normalizedUrl);

      // Recreate bookmark in Chrome if missing
      if (!targetLocal && options.restoreBookmarks) {
        try {
          const created = await createBookmark({
            parentId: "1", // Bookmarks Bar
            title: rb.title || rb.url,
            url: rb.url,
            tags: rb.tags || [],
            description: rb.description || "",
            notes: rb.notes || "",
            isFavorite: rb.isFavorite || false,
            favicon: rb.favicon,
            screenshot: rb.screenshot,
            ogImage: rb.ogImage,
          });
          targetLocal = created;
          urlToLocalBookmark.set(normalizedUrl, created);
          createdCount++;
        } catch (createErr) {
          console.warn(`Could not restore bookmark ${rb.url}:`, createErr);
        }
      }

      if (targetLocal) {
        const existingMeta = remoteMetadata[rb.id] || {};
        metadataUpdates[targetLocal.id] = {
          tags: Array.from(
            new Set([...(targetLocal.tags || []), ...(rb.tags || []), ...(existingMeta.tags || [])])
          ),
          description: rb.description || existingMeta.description || targetLocal.description,
          notes: rb.notes || existingMeta.notes || targetLocal.notes,
          isFavorite: rb.isFavorite ?? existingMeta.isFavorite ?? targetLocal.isFavorite,
          screenshot: rb.screenshot || existingMeta.screenshot || targetLocal.screenshot,
          ogImage: rb.ogImage || existingMeta.ogImage || targetLocal.ogImage,
          favicon: rb.favicon || existingMeta.favicon || targetLocal.favicon,
          httpStatus: rb.httpStatus || existingMeta.httpStatus || targetLocal.httpStatus,
          httpStatusText: rb.httpStatusText || existingMeta.httpStatusText || targetLocal.httpStatusText,
          finalUrl: rb.finalUrl || existingMeta.finalUrl || targetLocal.finalUrl,
          lastChecked: rb.lastChecked || existingMeta.lastChecked || targetLocal.lastChecked,
        };
        updatedCount++;
      }
    }

    for (const [metaId, meta] of Object.entries(remoteMetadata)) {
      if (!metadataUpdates[metaId]) {
        metadataUpdates[metaId] = meta;
      }
    }

    if (Object.keys(metadataUpdates).length > 0) {
      await bulkUpdateMetadata(metadataUpdates);
    }

    const totalProcessed = createdCount + updatedCount;
    let summaryMsg = `Successfully synced vault from GitHub!`;
    if (createdCount > 0 && updatedCount > 0) {
      summaryMsg = `Restored ${createdCount} missing bookmarks and updated metadata for ${updatedCount} existing bookmarks!`;
    } else if (createdCount > 0) {
      summaryMsg = `Restored ${createdCount} bookmarks from GitHub!`;
    } else if (updatedCount > 0) {
      summaryMsg = `Synchronized metadata for ${updatedCount} bookmarks from GitHub!`;
    }

    return {
      success: true,
      message: summaryMsg,
      count: totalProcessed,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to restore from GitHub: ${err.message || err}`,
      count: 0,
    };
  }
}
