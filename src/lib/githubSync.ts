/**
 * Noob31 Bookmark Vault - GitHub Sync Engine
 * Modeled on robust client-side REST sync with conflict resolution,
 * UTF-8 Base64 encoding/decoding, Git Data API batching with Contents API fallback,
 * and cross-machine bookmark restoration.
 */
import { GitHubConfig, EnhancedBookmark, BookmarkMetadata, FolderNode, UserPreferences, ArchiveSummary } from "./types";
import { getArchive, putArchive } from "./archiveStore";
import {
  saveGitHubConfig,
  getAllMetadata,
  bulkUpdateMetadata,
  getUserPreferences,
  saveUserPreferences,
  getSavedTheme,
  saveTheme,
} from "./metadataStore";
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

// --- Binary helpers ---
function bytesToBase64(bytes: Uint8Array): string {
  // Chunked conversion: avoids O(n^2) string building and call-stack limits on multi-MB payloads
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob((b64 || "").replace(/[^A-Za-z0-9+/=]/g, ""));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// --- UTF-8 Safe Base64 Encoding and Decoding ---
export function safeB64Encode(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str));
}

export function safeB64Decode(str: string): string {
  return new TextDecoder("utf-8").decode(base64ToBytes(str));
}

export const utf8ToBase64 = safeB64Encode;
export const base64ToUtf8 = safeB64Decode;

export function isValidGitSha(sha?: string | null): boolean {
  return typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha.trim());
}

/** Computes the exact object id Git assigns to a blob (identical to `git hash-object`). */
async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const buffer = new Uint8Array(header.length + bytes.length);
  buffer.set(header, 0);
  buffer.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Image Data URL helpers ---
const IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

export function mimeFromAssetPath(path?: string): string {
  const ext = (path || "").split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXT_TO_MIME[ext] || "image/webp";
}

function parseDataUrl(dataUrl: string): { mime: string; ext: string; isBase64: boolean; payload: string } | null {
  const match = /^data:([^;,]*)([^,]*),([\s\S]*)$/.exec((dataUrl || "").trim());
  if (!match) return null;
  const mime = (match[1] || "image/png").toLowerCase();
  return {
    mime,
    ext: IMAGE_MIME_TO_EXT[mime] || "img",
    isBase64: /;base64/i.test(match[2]),
    payload: match[3],
  };
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !parsed.payload) return null;
  try {
    const bytes = parsed.isBase64
      ? base64ToBytes(parsed.payload)
      : new TextEncoder().encode(decodeURIComponent(parsed.payload));
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function dataUrlToBase64(dataUrl: string): string | null {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !parsed.payload) return null;
  if (parsed.isBase64) return parsed.payload.replace(/[^A-Za-z0-9+/=]/g, "") || null;
  const bytes = dataUrlToBytes(dataUrl);
  return bytes ? bytesToBase64(bytes) : null;
}

// --- Path helpers ---
/** Truncates a string to a UTF-8 byte budget without ever splitting a code point (emoji etc.). */
function truncateUtf8(str: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let out = "";
  let used = 0;
  for (const ch of str) {
    const size = encoder.encode(ch).length;
    if (used + size > maxBytes) break;
    out += ch;
    used += size;
  }
  return out;
}

// Strictly cleans path segments for Git Tree compatibility
export function sanitizePathSegment(name: string): string {
  let cleaned = (name || "untitled")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "") // Strip lone surrogates (invalid UTF-8)
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "") // Strip invisible control characters
    .replace(/[/\\?%*:|"<>]/g, "-") // Replace forbidden chars
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();

  // Keep each segment well under the 255-byte filesystem limit
  cleaned = truncateUtf8(cleaned, 180).trim();

  // Disallow dot-dot (directory traversal)
  if (cleaned === ".." || cleaned === ".") return "item";
  if (cleaned.toLowerCase() === ".git") return "git-dir";

  // Disallow trailing periods on Windows/Git filenames (e.g. "foo.")
  cleaned = cleaned.replace(/\.+$/g, "").trim();

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

/** Paths owned (and fully rewritten) by the vault. Everything else in the repo is preserved untouched. */
function isVaultManagedPath(path: string): boolean {
  return (
    path.startsWith("bookmarks/") ||
    path.startsWith("assets/screenshots/") ||
    path.startsWith("assets/archives/") ||
    path.startsWith(".noob31/") ||
    path === "README.md" ||
    path === "bookmarks-vault.json"
  );
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

// --- Rate-limit aware write helper ---
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// MV3 service workers are torn down after ~30s idle, so never sleep for long there
const IS_SERVICE_WORKER = typeof window === "undefined";
const MAX_RATE_LIMIT_WAIT_MS = IS_SERVICE_WORKER ? 25_000 : 90_000;

// GitHub's secondary limits allow ~80 content-creating requests/minute → space POSTs ~750ms apart
const WRITE_MIN_INTERVAL_MS = 750;
let nextWriteSlot = 0;
async function waitForWriteSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextWriteSlot);
  nextWriteSlot = slot + WRITE_MIN_INTERVAL_MS;
  if (slot > now) await sleep(slot - now);
}

class GitHubRateLimitError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "GitHubRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

class GitHubApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

/** POSTs JSON to a content-creating endpoint with pacing, 5xx retries and rate-limit backoff. */
async function githubWrite(token: string, endpoint: string, body: unknown, maxRetries = 4): Promise<any> {
  let attempt = 0;
  for (;;) {
    await waitForWriteSlot();
    let res: Response;
    try {
      res = await githubRequest(token, endpoint, { method: "POST", body: JSON.stringify(body) });
    } catch (networkErr: any) {
      if (String(networkErr?.message || "").includes("401") || attempt >= maxRetries) throw networkErr;
      await sleep(1000 * 2 ** attempt++);
      continue;
    }

    if (res.ok) return res.json();

    const errData = await res.json().catch(() => ({}));
    const message: string = errData.message || `HTTP ${res.status}`;
    const retryAfter = Number(res.headers.get("retry-after"));
    const isRateLimited =
      res.status === 429 ||
      (res.status === 403 &&
        (/rate limit/i.test(message) || retryAfter > 0 || res.headers.get("x-ratelimit-remaining") === "0"));

    if (isRateLimited) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      let waitMs = retryAfter > 0 ? retryAfter * 1000 : reset > 0 ? reset * 1000 - Date.now() : 60_000;
      if (!(waitMs > 0)) waitMs = 60_000;
      if (waitMs > MAX_RATE_LIMIT_WAIT_MS || attempt >= maxRetries) {
        throw new GitHubRateLimitError(`GitHub rate limit reached: ${message}`, waitMs);
      }
      await sleep(waitMs + 500);
      attempt++;
      continue;
    }

    if (res.status >= 500 && attempt < maxRetries) {
      await sleep(1000 * 2 ** attempt++);
      continue;
    }

    const details = errData.errors ? ` ${JSON.stringify(errData.errors)}` : "";
    throw new GitHubApiError(`${message}${details} (HTTP ${res.status})`, res.status);
  }
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
  folderMap: Record<string, string>,
  stats?: {
    screenshotsCommitted: number;
    screenshotsPending: number;
    fullPageCommitted?: number;
    fullPagePending?: number;
    mhtmlCommitted?: number;
    mhtmlPending?: number;
  }
): string {
  const dateStr = new Date().toLocaleString();
  const total = bookmarks.length;
  const starred = bookmarks.filter((b) => b.isFavorite).length;
  const withScreenshots = stats ? stats.screenshotsCommitted : bookmarks.filter((b) => b.screenshot || b.githubSha).length;
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

  const snapshotDetails =
    stats && stats.screenshotsPending > 0
      ? `Saved in \`assets/screenshots/\` (${stats.screenshotsPending} queued for next sync)`
      : "Saved in `assets/screenshots/`";

  const archiveDetails = (pending?: number) =>
    pending && pending > 0
      ? `Saved in \`assets/archives/\` (${pending} queued for next sync)`
      : "Saved in `assets/archives/`";
  const fullPageCount = stats?.fullPageCommitted ?? bookmarks.filter((b) => b.archive?.fullPageBytes).length;
  const mhtmlCount = stats?.mhtmlCommitted ?? bookmarks.filter((b) => b.archive?.mhtmlBytes).length;

  let md = `# 📑 Personal Bookmarks Vault\n\n`;
  md += `> Automatically synchronized and version-controlled with [Noob31 Bookmark Vault](https://noob31.com)\n\n`;

  md += `### 📊 Vault Overview\n\n`;
  md += `| Metric | Count | Details |\n`;
  md += `| :--- | :---: | :--- |\n`;
  md += `| 🔖 **Total Bookmarks** | **${total}** | Across ${Object.keys(folderCounts).length} folders |\n`;
  md += `| ⭐ **Starred / Favorites** | **${starred}** | ${total > 0 ? Math.round((starred / total) * 100) : 0}% of vault |\n`;
  md += `| 📸 **Visual Snapshots** | **${withScreenshots}** | ${snapshotDetails} |\n`;
  md += `| 🖼️ **Full-Page Images** | **${fullPageCount}** | ${archiveDetails(stats?.fullPagePending)} |\n`;
  md += `| 🗃️ **MHTML Page Snapshots** | **${mhtmlCount}** | ${archiveDetails(stats?.mhtmlPending)} |\n`;
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
  md += `- **\`.noob31/vault-index.json\`**: Complete structured database (bookmarks, folders, metadata, reader content & settings) for rapid cross-device synchronization and restoration.\n`;
  md += `- **\`bookmarks/\`**: Individual JSON definitions categorized by folder structure.\n`;
  md += `- **\`assets/screenshots/\`**: Viewport snapshots and visual assets for saved pages.\n`;
  md += `- **\`assets/archives/\`**: Full-page screenshots and MHTML page snapshots.\n`;

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

// --- Check whether a blob already exists in the repository object store ---
async function blobExists(token: string, repo: string, sha: string): Promise<boolean> {
  try {
    const headRes = await githubRequest(token, `/repos/${repo}/git/blobs/${sha}`, { method: "HEAD" });
    if (headRes.ok) return true;
    if (headRes.status === 404 || headRes.status === 422) return false;
    const getRes = await githubRequest(token, `/repos/${repo}/git/blobs/${sha}`);
    return getRes.ok;
  } catch {
    return false;
  }
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

// --- Fetch the full recursive tree of a commit ---
type RemoteTreeItem = { path: string; mode: string; type: string; sha: string; size?: number };

async function fetchCommitTree(token: string, repo: string, commitSha: string): Promise<RemoteTreeItem[]> {
  const commitRes = await githubRequest(token, `/repos/${repo}/git/commits/${commitSha}`);
  if (!commitRes.ok) {
    throw new Error(`Could not read current branch commit (HTTP ${commitRes.status}).`);
  }
  const commitData = await commitRes.json();
  const treeSha = commitData.tree?.sha;
  if (!isValidGitSha(treeSha)) return [];

  const treeRes = await githubRequest(token, `/repos/${repo}/git/trees/${treeSha}?recursive=1`);
  if (!treeRes.ok) {
    throw new Error(`Could not read current repository tree (HTTP ${treeRes.status}).`);
  }
  const treeData = await treeRes.json();
  if (treeData.truncated) {
    throw new Error("Repository tree is too large for the GitHub API to list (truncated). Use a dedicated vault repository.");
  }
  return treeData.tree || [];
}

// --- Chunked Tree Builder ---
type TreeEntry = {
  path: string;
  mode: string;
  type: "blob" | "commit";
  sha?: string;
  content?: string;
};

const TREE_CHUNK_MAX_ENTRIES = 400;
const TREE_CHUNK_MAX_BYTES = 1_500_000;
const INLINE_TEXT_MAX_BYTES = 512 * 1024;
const MAX_ISOLATED_FAILURES = 25;

/**
 * Builds one complete tree from many entries by creating it in small, size-bounded chunks
 * (each chunk layered on top of the previous via base_tree). A single bad entry is isolated
 * by bisection and skipped instead of aborting the whole sync.
 */
async function createTreeInChunks(
  token: string,
  repo: string,
  entries: TreeEntry[],
  onChunk?: (done: number, total: number) => void
): Promise<{ treeSha: string; failed: Array<{ path: string; error: string }> }> {
  const chunks: TreeEntry[][] = [];
  let current: TreeEntry[] = [];
  let currentBytes = 0;
  for (const entry of entries) {
    const size = (entry.content?.length || 0) + entry.path.length + 120;
    if (current.length > 0 && (current.length >= TREE_CHUNK_MAX_ENTRIES || currentBytes + size > TREE_CHUNK_MAX_BYTES)) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(entry);
    currentBytes += size;
  }
  if (current.length > 0) chunks.push(current);

  let baseTreeSha: string | null = null;
  const failed: Array<{ path: string; error: string }> = [];

  async function apply(chunk: TreeEntry[]): Promise<void> {
    try {
      const body: any = { tree: chunk };
      if (baseTreeSha) body.base_tree = baseTreeSha;
      const data = await githubWrite(token, `/repos/${repo}/git/trees`, body);
      if (!isValidGitSha(data?.sha)) throw new Error("GitHub returned an invalid tree SHA.");
      baseTreeSha = data.sha;
    } catch (err: any) {
      // Only bisect on content-level errors; auth/permission/rate-limit failures are fatal
      const status = err instanceof GitHubApiError ? err.status : 0;
      const isolatable = status === 422 || status === 400 || status >= 500 || status === 0;
      if (err instanceof GitHubRateLimitError || !isolatable) throw err;

      if (chunk.length === 1) {
        failed.push({ path: chunk[0].path, error: err.message || String(err) });
        console.warn(`Skipping vault file that GitHub rejected: ${chunk[0].path}`, err);
        if (failed.length > MAX_ISOLATED_FAILURES) {
          throw new Error(`GitHub rejected too many files (last: ${chunk[0].path}): ${err.message || err}`);
        }
        return;
      }
      const mid = Math.ceil(chunk.length / 2);
      await apply(chunk.slice(0, mid));
      await apply(chunk.slice(mid));
    }
  }

  for (let i = 0; i < chunks.length; i++) {
    await apply(chunks[i]);
    onChunk?.(i + 1, chunks.length);
  }

  if (!baseTreeSha) {
    throw new Error(`Git tree creation failed: ${failed[0]?.error || "no entries were accepted"}`);
  }
  return { treeSha: baseTreeSha, failed };
}

// --- Folder path mapping (skips Chrome's unnamed root node) ---
function buildFolderPathMap(folderTree: FolderNode[]): Record<string, string> {
  const folderMap: Record<string, string> = {};
  function walk(nodes: FolderNode[], prefix: string) {
    for (const n of nodes) {
      if (!n.parentId && !prefix) {
        // Chrome's synthetic root (id "0") — its children are Bookmarks bar / Other / Mobile
        if (n.children) walk(n.children, "");
        continue;
      }
      const segment = sanitizePathSegment(n.title);
      const fullPath = prefix ? `${prefix}/${segment}` : segment;
      folderMap[n.id] = fullPath;
      if (n.children) walk(n.children, fullPath);
    }
  }
  walk(folderTree, "");
  return folderMap;
}

export interface SyncProgress {
  phase: "preparing" | "screenshots" | "uploading" | "committing";
  message: string;
  current?: number;
  total?: number;
}

const SCREENSHOT_UPLOAD_BUDGET_MS = IS_SERVICE_WORKER ? 3 * 60_000 : 5 * 60_000;
const MAX_SYNC_ROUNDS = 50;
const MAX_TOTAL_RATE_LIMIT_WAIT_MS = 30 * 60_000;
const MAX_BRANCH_CONFLICT_RETRIES = 3;

interface SyncPassResult {
  success: boolean;
  message: string;
  timestamp: number;
  pending?: number; // binary assets still waiting for upload after this pass
  retryAfterMs?: number; // set when GitHub rate limiting cut the pass short
  rateLimited?: boolean; // the pass failed outright because of rate limiting
  conflict?: boolean; // the branch moved while committing
}

class BranchMovedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BranchMovedError";
  }
}

/** Sleeps in short slices and pings an extension API so an MV3 service worker isn't torn down mid-wait. */
async function keepAliveSleep(ms: number, onTick?: (remainingMs: number) => void): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    onTick?.(end - Date.now());
    await sleep(Math.min(IS_SERVICE_WORKER ? 20_000 : 5_000, end - Date.now()));
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.getPlatformInfo) await chrome.runtime.getPlatformInfo();
    } catch {}
  }
}

// --- Push Complete Bookmark Vault to GitHub (keeps committing rounds until everything is uploaded) ---
export async function syncVaultToGitHub(
  rawConfig: GitHubConfig,
  onProgress?: (progress: SyncProgress) => void
): Promise<{ success: boolean; message: string; timestamp: number }> {
  const report = (p: SyncProgress) => {
    try {
      onProgress?.(p);
    } catch {}
  };

  let round = 0;
  let conflicts = 0;
  let stalledRounds = 0;
  let totalWaitedMs = 0;
  let lastPending = Number.POSITIVE_INFINITY;
  let last: SyncPassResult | null = null;
  let stopReason = "";

  while (round < MAX_SYNC_ROUNDS) {
    round++;
    const prefix = round > 1 ? `[Round ${round}] ` : "";
    const res = await syncVaultPass(rawConfig, (p) => report({ ...p, message: prefix + p.message }));
    last = res;

    if (res.conflict) {
      if (++conflicts > MAX_BRANCH_CONFLICT_RETRIES) break;
      report({ phase: "preparing", message: "Branch changed on GitHub, rebasing and retrying..." });
      await sleep(1500);
      continue;
    }
    if (!res.success && !res.rateLimited) break;

    const pending = res.pending ?? 0;
    if (res.success && pending === 0) break;

    if (res.success) {
      stalledRounds = pending >= lastPending ? stalledRounds + 1 : 0;
      lastPending = pending;
      // No progress without a rate limit to wait out (e.g. permission errors) → retrying won't help
      if (stalledRounds >= 2 || (stalledRounds >= 1 && !res.retryAfterMs)) {
        stopReason = "uploads stopped making progress";
        break;
      }
    }

    const waitMs = res.retryAfterMs ? res.retryAfterMs + 1000 : 0;
    if (waitMs > 0) {
      if (totalWaitedMs + waitMs > MAX_TOTAL_RATE_LIMIT_WAIT_MS) {
        stopReason = `GitHub rate limit resets in ~${Math.ceil(waitMs / 60_000)} min`;
        break;
      }
      totalWaitedMs += waitMs;
      await saveGitHubConfig({ syncStatus: "syncing" });
      await keepAliveSleep(waitMs, (remaining) =>
        report({
          phase: "uploading",
          message: `GitHub rate limit reached (${pending} files left). Resuming automatically in ${Math.ceil(remaining / 1000)}s...`,
        })
      );
    }
  }

  const result = last || { success: false, message: "Sync did not run.", timestamp: Date.now() };
  let message = result.message;
  if (result.conflict) {
    message += " Retried several times, but the branch kept changing. Please try again shortly.";
    await saveGitHubConfig({ syncStatus: "error", lastSyncError: message });
  }
  if (result.success && round > 1) message += ` Completed in ${round} commit rounds.`;
  if (result.success && (result.pending ?? 0) > 0) {
    message += ` Stopped auto-resuming${stopReason ? ` (${stopReason})` : ""}; the remaining files will upload on the next sync.`;
  }
  return { success: result.success, message, timestamp: result.timestamp };
}

// --- Single sync pass: upload what fits in this run's budget, then commit ---
async function syncVaultPass(
  rawConfig: GitHubConfig,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncPassResult> {
  const config = sanitizeGitHubConfig(rawConfig);
  if (!config.token || !config.owner || !config.repo) {
    return {
      success: false,
      message: "Personal Access Token, Owner, and Repository name are all required.",
      timestamp: Date.now(),
    };
  }

  const report = (p: SyncProgress) => {
    try {
      onProgress?.(p);
    } catch {}
  };

  const repoPath = `${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  await saveGitHubConfig({ ...config, syncStatus: "syncing", lastSyncError: undefined });

  // Kept outside the try so a fatal failure can still push a safety snapshot of the index
  let safetySnapshot: { index: string; readme: string; count: number } | null = null;

  try {
    report({ phase: "preparing", message: "Reading local bookmarks & metadata..." });
    const [tree, metadata, preferences, theme] = await Promise.all([
      getEnhancedBookmarkTree(),
      getAllMetadata(),
      getUserPreferences(),
      getSavedTheme(),
    ]);
    const flatList = extractAllBookmarks(tree);
    const folderTree = extractFolderTree(tree);
    const folderMap = buildFolderPathMap(folderTree);
    const folderPathOf = (parentId?: string) => folderMap[parentId || ""] || "Bookmarks Bar";

    // 1. Resolve branch head. The Git Data API cannot write to a completely empty repo, so bootstrap it first.
    report({ phase: "preparing", message: "Inspecting remote repository..." });
    let head = await getBranchHeadCommit(config.token, repoPath, config.branch);
    if (head.isEmpty) {
      await forceCommitFile(
        config.token,
        repoPath,
        config.branch,
        "README.md",
        "# 📑 Personal Bookmarks Vault\n\nInitializing vault...\n",
        "[Vault Sync] Initialize vault repository"
      );
      head = await getBranchHeadCommit(config.token, repoPath, config.branch);
    }
    const parentCommitSha = isValidGitSha(head.sha) ? (head.sha as string) : null;

    // 2. Index the current remote tree: reuse unchanged blobs and preserve non-vault files (.github, LICENSE, ...)
    const remoteBlobByPath = new Map<string, string>();
    const remoteShaSet = new Set<string>();
    const preservedEntries: TreeEntry[] = [];
    if (parentCommitSha) {
      const remoteItems = await fetchCommitTree(config.token, repoPath, parentCommitSha);
      for (const item of remoteItems) {
        if (!isValidGitSha(item.sha)) continue;
        if (item.type === "blob") {
          remoteBlobByPath.set(item.path, item.sha.toLowerCase());
          remoteShaSet.add(item.sha.toLowerCase());
        }
        if ((item.type === "blob" || item.type === "commit") && !isVaultManagedPath(item.path)) {
          preservedEntries.push({ path: item.path, mode: item.mode, type: item.type as "blob" | "commit", sha: item.sha });
        }
      }
    }

    // 3. Plan screenshots: hash locally so unchanged images are never re-uploaded
    report({ phase: "screenshots", message: "Hashing screenshots..." });
    type ArchiveKind = "fullPage" | "mhtml";
    type ShotPlan = {
      id: string;
      path: string;
      sha: string;
      dataUrl?: string;
      kind?: ArchiveKind;
      mime?: string;
      size?: number;
      getBase64?: () => Promise<string | null>;
    };
    type ArchiveFileRef = { path: string; sha: string; mime: string; bytes: number };
    type ArchiveRefEntry = {
      capturedAt: number;
      width?: number;
      height?: number;
      fullPage?: ArchiveFileRef;
      mhtml?: ArchiveFileRef;
    };
    const archiveRefs = new Map<string, ArchiveRefEntry>();
    const screenshotRefs = new Map<string, { path: string; sha: string }>();
    const shotsToVerify: ShotPlan[] = [];
    const shotsToUpload: ShotPlan[] = [];
    const metadataUpdates: Record<string, Partial<BookmarkMetadata>> = {};
    const bookmarksWithScreenshots = flatList.filter((b) => !!b.screenshot);

    await runWithConcurrency(bookmarksWithScreenshots, 4, async (b) => {
      const shot = b.screenshot as string;
      if (shot.startsWith("data:")) {
        const parsed = parseDataUrl(shot);
        const bytes = dataUrlToBytes(shot);
        if (!parsed || !bytes) return;
        const path = `assets/screenshots/${sanitizePathSegment(b.id)}.${parsed.ext}`;
        const sha = await gitBlobSha(bytes);
        if (remoteShaSet.has(sha)) {
          screenshotRefs.set(b.id, { path, sha });
          if (b.githubSha !== sha) metadataUpdates[b.id] = { githubSha: sha };
        } else if ((b.githubSha || "").toLowerCase() === sha) {
          shotsToVerify.push({ id: b.id, path, sha, dataUrl: shot });
        } else {
          shotsToUpload.push({ id: b.id, path, sha, dataUrl: shot });
        }
      } else {
        // Non-inline reference (e.g. "assets/screenshots/<id>.webp" left over from a pull whose download failed)
        const refPath = cleanGitPath(shot);
        const cachedSha = (b.githubSha || "").toLowerCase();
        const sha = remoteBlobByPath.get(refPath) || (remoteShaSet.has(cachedSha) ? cachedSha : undefined);
        if (sha) {
          const path = refPath.startsWith("assets/screenshots/") ? refPath : `assets/screenshots/${sanitizePathSegment(b.id)}.webp`;
          screenshotRefs.set(b.id, { path, sha });
        }
      }
    });

    // 3b. Plan page archives (full-page screenshot + MHTML from IndexedDB)
    const bookmarksWithArchives = flatList.filter((b) => !!b.archive);
    let fullPageLocal = 0;
    let mhtmlLocal = 0;
    if (bookmarksWithArchives.length > 0) {
      report({ phase: "screenshots", message: "Hashing page archives..." });
      await runWithConcurrency(bookmarksWithArchives, 2, async (b) => {
        const archive = await getArchive(b.id);
        if (!archive || (!archive.fullPage && !archive.mhtml)) return;
        const entry: ArchiveRefEntry = {
          capturedAt: archive.capturedAt,
          width: archive.fullPageWidth,
          height: archive.fullPageHeight,
        };
        archiveRefs.set(b.id, entry);
        if (archive.fullPage?.size) fullPageLocal++;
        if (archive.mhtml?.size) mhtmlLocal++;
        const kinds: ArchiveKind[] = ["fullPage", "mhtml"];
        for (const kind of kinds) {
          const blob = archive[kind];
          if (!blob || !blob.size) continue;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const mime = kind === "mhtml" ? blob.type || "multipart/related" : (blob.type || "image/png").toLowerCase();
          const ext = kind === "mhtml" ? "mhtml" : IMAGE_MIME_TO_EXT[mime] || "png";
          const path = `assets/archives/${sanitizePathSegment(b.id)}/${kind === "mhtml" ? "page" : "fullpage"}.${ext}`;
          const sha = await gitBlobSha(bytes);
          if (remoteShaSet.has(sha)) {
            entry[kind] = { path, sha, mime, bytes: bytes.length };
          } else {
            const id = b.id;
            shotsToUpload.push({
              id,
              path,
              sha,
              kind,
              mime,
              size: bytes.length,
              // Re-read lazily so multi-MB archives are not all held in memory at once
              getBase64: async () => {
                const fresh = (await getArchive(id))?.[kind];
                return fresh ? bytesToBase64(new Uint8Array(await fresh.arrayBuffer())) : null;
              },
            });
          }
        }
      });
    }

    // Blobs uploaded by earlier (failed) syncs usually still exist even though they were never committed
    if (shotsToVerify.length > 0) {
      let verified = 0;
      await runWithConcurrency(shotsToVerify, 8, async (s) => {
        if (await blobExists(config.token, repoPath, s.sha)) {
          screenshotRefs.set(s.id, { path: s.path, sha: s.sha });
        } else {
          shotsToUpload.push(s);
        }
        verified++;
        report({
          phase: "screenshots",
          message: `Verifying previously uploaded screenshots ${verified}/${shotsToVerify.length}...`,
          current: verified,
          total: shotsToVerify.length,
        });
      });
    }

    // 4. Upload genuinely new screenshots (paced for GitHub's secondary rate limits, time-boxed per run)
    let screenshotsPending = 0;
    let screenshotHaltReason: string | null = null;
    let rateLimitRetryMs = 0;
    if (shotsToUpload.length > 0) {
      const deadline = Date.now() + SCREENSHOT_UPLOAD_BUDGET_MS;
      let processed = 0;
      await runWithConcurrency(shotsToUpload, 3, async (s) => {
        if (screenshotHaltReason || Date.now() > deadline) {
          screenshotsPending++;
          return;
        }
        try {
          const base64 = s.getBase64 ? await s.getBase64() : s.dataUrl ? dataUrlToBase64(s.dataUrl) : null;
          if (!base64) return;
          const data = await githubWrite(config.token, `/repos/${repoPath}/git/blobs`, {
            content: base64,
            encoding: "base64",
          });
          if (isValidGitSha(data?.sha)) {
            if (s.kind) {
              const entry = archiveRefs.get(s.id);
              if (entry) entry[s.kind] = { path: s.path, sha: data.sha, mime: s.mime || "", bytes: s.size || 0 };
            } else {
              screenshotRefs.set(s.id, { path: s.path, sha: data.sha });
              metadataUpdates[s.id] = { githubSha: data.sha };
            }
          } else {
            screenshotsPending++;
          }
        } catch (err: any) {
          screenshotsPending++;
          if (err instanceof GitHubRateLimitError) {
            screenshotHaltReason = err.message;
            rateLimitRetryMs = Math.max(rateLimitRetryMs, err.retryAfterMs);
          } else if (err instanceof GitHubApiError && [403, 404].includes(err.status)) {
            screenshotHaltReason = err.message; // Permission problem: every upload would fail
          } else if (String(err?.message || "").includes("401")) {
            throw err;
          }
          console.warn(`Screenshot upload deferred for bookmark ${s.id}:`, err);
        }
        processed++;
        report({
          phase: "screenshots",
          message: `Uploading screenshots & archives ${processed}/${shotsToUpload.length}...`,
          current: processed,
          total: shotsToUpload.length,
        });
      });
      if (!screenshotHaltReason && screenshotsPending > 0 && Date.now() > deadline) {
        screenshotHaltReason = "time budget for this run reached";
      }
    }

    // Persist every confirmed blob SHA so later syncs (or a crash mid-run) never re-upload the same image
    if (Object.keys(metadataUpdates).length > 0) {
      await bulkUpdateMetadata(metadataUpdates);
    }

    // 5. Build every vault file
    report({ phase: "uploading", message: "Preparing vault files..." });

    // Only archives with at least one committed file are published
    const committedArchives: Record<string, ArchiveRefEntry> = {};
    let archiveFileCount = 0;
    let fullPageCommitted = 0;
    let mhtmlCommitted = 0;
    for (const [id, entry] of archiveRefs) {
      if (!entry.fullPage && !entry.mhtml) continue;
      committedArchives[id] = entry;
      if (entry.fullPage) fullPageCommitted++;
      if (entry.mhtml) mhtmlCommitted++;
    }
    archiveFileCount = fullPageCommitted + mhtmlCommitted;
    const fullPagePending = Math.max(0, fullPageLocal - fullPageCommitted);
    const mhtmlPending = Math.max(0, mhtmlLocal - mhtmlCommitted);
    const viewportScreenshotsPending = Math.max(0, screenshotsPending - fullPagePending - mhtmlPending);

    const toCloudBookmark = (b: EnhancedBookmark, includeReaderContent: boolean) => {
      const ref = screenshotRefs.get(b.id);
      return {
        id: b.id,
        parentId: b.parentId,
        index: b.index,
        folderPath: folderPathOf(b.parentId),
        title: b.title,
        fetchedTitle: b.fetchedTitle,
        url: b.url,
        domain: getDomain(b.url),
        dateAdded: b.dateAdded,
        dateGroupModified: b.dateGroupModified,
        tags: b.tags || [],
        description: b.description || "",
        notes: b.notes || "",
        isFavorite: b.isFavorite || false,
        favicon: b.favicon,
        ogImage: b.ogImage,
        fetchedImages: b.fetchedImages,
        httpStatus: b.httpStatus,
        httpStatusText: b.httpStatusText,
        finalUrl: b.finalUrl,
        isRedirect: b.isRedirect,
        lastChecked: b.lastChecked,
        lastCaptured: b.lastCaptured,
        screenshot: ref?.path,
        githubSha: ref?.sha,
        screenshotPending: b.screenshot && !ref ? true : undefined,
        archive: b.archive,
        archiveFiles: committedArchives[b.id],
        readerContent: includeReaderContent ? b.readerContent : undefined,
      };
    };

    const cloudMetadata: Record<string, BookmarkMetadata> = {};
    for (const [id, meta] of Object.entries(metadata)) {
      const ref = screenshotRefs.get(id);
      cloudMetadata[id] = {
        ...meta,
        screenshot: ref?.path,
        githubSha: ref?.sha,
      };
    }

    const settings: { preferences: UserPreferences; theme: "dark" | "light" } = { preferences, theme };

    const vaultIndex = {
      version: "2.2.0",
      syncedAt: new Date().toISOString(),
      bookmarkCount: flatList.length,
      folderCount: Object.keys(folderMap).length,
      screenshotCount: screenshotRefs.size,
      archiveCount: Object.keys(committedArchives).length,
      screenshotsPending: viewportScreenshotsPending,
      fullPageCount: fullPageCommitted,
      fullPagePending,
      mhtmlCount: mhtmlCommitted,
      mhtmlPending,
      folderMap,
      folderTree,
      // Reader content lives once in `metadata` to keep the index lean
      bookmarks: flatList.map((b) => toCloudBookmark(b, false)),
      metadata: cloudMetadata,
      archives: committedArchives,
      settings,
    };

    const files = new Map<string, string>();
    const indexJson = JSON.stringify(vaultIndex, null, 2);
    const readmeContent = generateMarkdownReadme(flatList, folderMap, {
      screenshotsCommitted: screenshotRefs.size,
      screenshotsPending: viewportScreenshotsPending,
      fullPageCommitted,
      fullPagePending,
      mhtmlCommitted,
      mhtmlPending,
    });
    files.set(".noob31/vault-index.json", indexJson);
    files.set("README.md", readmeContent);
    safetySnapshot = { index: indexJson, readme: readmeContent, count: flatList.length };

    for (const b of flatList) {
      const cleanFolder = cleanGitPath(folderPathOf(b.parentId)) || "Bookmarks Bar";
      const fileSlug = sanitizePathSegment(truncateUtf8(sanitizePathSegment(b.title || b.id), 80));
      const filePath = `bookmarks/${cleanFolder}/${fileSlug}_${sanitizePathSegment(b.id)}.json`;
      files.set(filePath, JSON.stringify(toCloudBookmark(b, true), null, 2));
    }

    // 6. Convert files into tree entries (unchanged files reference their existing blob; changed ones go inline)
    const encoder = new TextEncoder();
    const entries: TreeEntry[] = [];
    const largeTextUploads: Array<{ path: string; bytes: Uint8Array }> = [];
    let changedFiles = 0;

    for (const [path, content] of files) {
      const bytes = encoder.encode(content);
      const sha = await gitBlobSha(bytes);
      if (remoteShaSet.has(sha)) {
        entries.push({ path, mode: "100644", type: "blob", sha });
        if (remoteBlobByPath.get(path) !== sha) changedFiles++;
        continue;
      }
      changedFiles++;
      if (bytes.length > INLINE_TEXT_MAX_BYTES) {
        largeTextUploads.push({ path, bytes });
      } else {
        entries.push({ path, mode: "100644", type: "blob", content });
      }
    }

    for (const item of largeTextUploads) {
      report({ phase: "uploading", message: `Uploading ${item.path}...` });
      const data = await githubWrite(config.token, `/repos/${repoPath}/git/blobs`, {
        content: bytesToBase64(item.bytes),
        encoding: "base64",
      });
      if (!isValidGitSha(data?.sha)) throw new Error(`Failed to upload ${item.path}`);
      // Index + README go first so they are always part of the earliest chunk
      entries.unshift({ path: item.path, mode: "100644", type: "blob", sha: data.sha });
    }

    for (const ref of screenshotRefs.values()) {
      entries.push({ path: ref.path, mode: "100644", type: "blob", sha: ref.sha });
      if (remoteBlobByPath.get(ref.path) !== ref.sha) changedFiles++;
    }

    for (const entry of Object.values(committedArchives)) {
      for (const ref of [entry.fullPage, entry.mhtml]) {
        if (!ref) continue;
        entries.push({ path: ref.path, mode: "100644", type: "blob", sha: ref.sha });
        if (remoteBlobByPath.get(ref.path) !== ref.sha) changedFiles++;
      }
    }

    const vaultPaths = new Set(entries.map((e) => e.path));
    for (const item of preservedEntries) {
      if (!vaultPaths.has(item.path)) entries.push(item);
    }

    // 7. Create the tree in bounded chunks
    report({ phase: "uploading", message: `Uploading ${entries.length} files to GitHub...` });
    const { treeSha, failed } = await createTreeInChunks(config.token, repoPath, entries, (done, total) =>
      report({
        phase: "uploading",
        message: `Uploading vault files (batch ${done}/${total})...`,
        current: done,
        total,
      })
    );

    // 8. Create the commit
    report({ phase: "committing", message: "Creating commit..." });
    const commitData = await githubWrite(config.token, `/repos/${repoPath}/git/commits`, {
      message: `[Vault Sync] Synchronized ${flatList.length} bookmarks, ${screenshotRefs.size} screenshots, ${archiveFileCount} archive files across ${Object.keys(folderMap).length} folders (${new Date().toLocaleDateString()})`,
      tree: treeSha,
      parents: parentCommitSha ? [parentCommitSha] : [],
    });
    const newCommitSha: string = commitData.sha;

    // 9. Move the branch (fast-forward only, so concurrent pushes are never silently clobbered)
    const targetBranch = config.branch || "main";
    const updateRefRes = await githubRequest(
      config.token,
      `/repos/${repoPath}/git/refs/heads/${encodeURIComponent(targetBranch)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ sha: newCommitSha, force: false }),
      }
    );

    if (!updateRefRes.ok) {
      const errData = await updateRefRes.json().catch(() => ({}));
      const refMessage: string = errData.message || updateRefRes.statusText;
      const refMissing = updateRefRes.status === 404 || /does not exist/i.test(refMessage);

      if (refMissing) {
        const createRefRes = await githubRequest(config.token, `/repos/${repoPath}/git/refs`, {
          method: "POST",
          body: JSON.stringify({ ref: `refs/heads/${targetBranch}`, sha: newCommitSha }),
        });
        if (!createRefRes.ok) {
          const createErr = await createRefRes.json().catch(() => ({}));
          throw new Error(`Failed to create branch "${targetBranch}" (${createRefRes.status}): ${createErr.message || createRefRes.statusText}`);
        }
      } else if (/fast.?forward/i.test(refMessage)) {
        throw new BranchMovedError(`Branch "${targetBranch}" changed on GitHub while syncing.`);
      } else {
        throw new Error(`Failed to update branch "${targetBranch}" (${updateRefRes.status}): ${refMessage}`);
      }
    }

    const timestamp = Date.now();
    await saveGitHubConfig({
      ...config,
      syncStatus: "success",
      lastSyncTime: timestamp,
      lastSyncError: undefined,
    });

    const notes: string[] = [];
    if (screenshotsPending > 0) {
      notes.push(`${screenshotsPending} screenshots/archive files still pending (${screenshotHaltReason || "GitHub rate limit"})`);
    }
    if (failed.length > 0) {
      notes.push(`${failed.length} files rejected by GitHub: ${failed.slice(0, 3).map((f) => f.path).join(", ")}${failed.length > 3 ? "..." : ""}`);
    }

    return {
      success: true,
      message:
        `Pushed ${flatList.length} bookmarks, ${screenshotRefs.size} screenshots, ${archiveFileCount} archive files & ${Object.keys(folderMap).length} folders to ${config.owner}/${config.repo} (${changedFiles} files changed).` +
        (notes.length > 0 ? ` ${notes.join(". ")}.` : ""),
      timestamp,
      pending: screenshotsPending,
      retryAfterMs: rateLimitRetryMs || undefined,
    };
  } catch (err: any) {
    let errorMsg = err?.message || "Failed to sync to GitHub";
    console.error("GitHub vault sync failed:", err);

    // Recoverable: the caller retries these automatically, so don't write a safety snapshot yet
    if (err instanceof BranchMovedError) {
      return { success: false, message: errorMsg, timestamp: Date.now(), conflict: true };
    }
    if (err instanceof GitHubRateLimitError) {
      await saveGitHubConfig({ ...config, syncStatus: "error", lastSyncError: errorMsg });
      return { success: false, message: errorMsg, timestamp: Date.now(), rateLimited: true, retryAfterMs: err.retryAfterMs };
    }

    // Safety net: at least persist the complete index so nothing is lost, but report the failure honestly
    if (safetySnapshot) {
      try {
        await forceCommitFile(
          config.token,
          repoPath,
          config.branch,
          ".noob31/vault-index.json",
          safetySnapshot.index,
          `[Vault Sync] Safety snapshot of ${safetySnapshot.count} bookmarks (full sync failed)`
        );
        errorMsg += " — a safety snapshot of vault-index.json was saved, but the full sync did not complete.";
      } catch (snapshotErr) {
        console.warn("Safety snapshot also failed:", snapshotErr);
      }
    }

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

  const isBarName = (s: string) => ["bookmarks bar", "bookmark bar", "bookmarks_bar"].includes(s.toLowerCase());
  const isOtherName = (s: string) => ["other bookmarks", "other_bookmarks", "other"].includes(s.toLowerCase());
  const isMobileName = (s: string) => ["mobile bookmarks", "mobile_bookmarks", "mobile"].includes(s.toLowerCase());

  // Older vaults prefixed every path with Chrome's unnamed root node (e.g. "Untitled/Bookmarks bar/...")
  if (
    rawSegments.length > 1 &&
    /^(untitled|root|folder|item)$/i.test(rawSegments[0]) &&
    (isBarName(rawSegments[1]) || isOtherName(rawSegments[1]) || isMobileName(rawSegments[1]))
  ) {
    rawSegments.shift();
  }

  let currentParentId = "1";
  let startIndex = 0;

  if (isBarName(rawSegments[0])) {
    currentParentId = "1";
    startIndex = 1;
  } else if (isOtherName(rawSegments[0])) {
    currentParentId = "2";
    startIndex = 1;
  } else if (isMobileName(rawSegments[0])) {
    currentParentId = "3";
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
        const idMatch = filename.replace(/\.[a-z0-9]+$/i, "").match(/(?:_|^)([0-9a-zA-Z_-]+)$/);
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
                isRedirect: bm.isRedirect,
                favicon: bm.favicon,
                ogImage: bm.ogImage,
                fetchedTitle: bm.fetchedTitle,
                fetchedImages: bm.fetchedImages,
                readerContent: bm.readerContent,
                lastChecked: bm.lastChecked,
                lastCaptured: bm.lastCaptured,
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
    const imageDownloadTasks: Array<{ targetId: string; blobSha: string; mime: string }> = [];

    // 0. Recreate the full folder structure (including empty folders), shallowest first
    if (options.restoreBookmarks) {
      const folderPaths = Array.from(new Set(Object.values(remoteFolderMap).filter(Boolean))).sort(
        (a, b) => a.split("/").length - b.split("/").length
      );
      for (const folderPath of folderPaths) {
        try {
          await ensureChromeFolderPath(folderPath);
        } catch (folderErr) {
          console.warn(`Could not restore folder ${folderPath}:`, folderErr);
        }
      }
    }

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
            mime: mimeFromAssetPath(assetPath),
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
              const dataUrl = `data:${task.mime};base64,${cleanBase64}`;
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

    // 2b. Restore page archives (full-page screenshot + MHTML) into IndexedDB
    const remoteArchives: Record<string, any> = vaultIndex.archives || {};
    const restoredArchiveSummaries = new Map<string, ArchiveSummary>();
    let restoredArchivesCount = 0;
    const fetchArchiveBlob = async (ref: any): Promise<Blob | undefined> => {
      if (!ref || !isValidGitSha(ref.sha)) return undefined;
      const res = await githubRequest(config.token, `/repos/${repoPath}/git/blobs/${ref.sha}`);
      if (!res.ok) return undefined;
      const data = await res.json();
      if (!data.content) return undefined;
      return new Blob([base64ToBytes(data.content) as BlobPart], { type: ref.mime || "" });
    };
    const archiveTasks = reconciledItems.filter((i) => remoteArchives[i.remoteBm.id]);
    await runWithConcurrency(archiveTasks, 2, async ({ targetId, remoteBm }) => {
      const ra = remoteArchives[remoteBm.id];
      try {
        const local = await getArchive(targetId);
        if (local && (local.fullPage || local.mhtml) && (local.capturedAt || 0) >= (ra.capturedAt || 0)) return;
        const [fullPage, mhtml] = await Promise.all([fetchArchiveBlob(ra.fullPage), fetchArchiveBlob(ra.mhtml)]);
        if (!fullPage && !mhtml) return;
        const capturedAt = ra.capturedAt || Date.now();
        await putArchive({
          id: targetId,
          url: remoteBm.url,
          title: remoteBm.title,
          capturedAt,
          fullPage,
          fullPageWidth: ra.width,
          fullPageHeight: ra.height,
          mhtml,
        });
        restoredArchiveSummaries.set(targetId, {
          capturedAt,
          fullPageBytes: fullPage?.size,
          fullPageWidth: ra.width,
          fullPageHeight: ra.height,
          mhtmlBytes: mhtml?.size,
        });
        restoredArchivesCount++;
      } catch (archiveErr) {
        console.warn(`Could not restore page archive for bookmark ${targetId}:`, archiveErr);
      }
    });

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
        fetchedTitle: remoteBm.fetchedTitle || remoteMeta.fetchedTitle || existingLocal.fetchedTitle,
        fetchedImages: remoteBm.fetchedImages || remoteMeta.fetchedImages || existingLocal.fetchedImages,
        httpStatus: remoteBm.httpStatus || remoteMeta.httpStatus || existingLocal.httpStatus,
        httpStatusText: remoteBm.httpStatusText || remoteMeta.httpStatusText || existingLocal.httpStatusText,
        finalUrl: remoteBm.finalUrl || remoteMeta.finalUrl || existingLocal.finalUrl,
        isRedirect: remoteBm.isRedirect ?? remoteMeta.isRedirect ?? existingLocal.isRedirect,
        lastChecked: remoteBm.lastChecked || remoteMeta.lastChecked || existingLocal.lastChecked,
        screenshot: finalScreenshot,
        githubSha: finalSha,
        lastCaptured: finalScreenshot
          ? (existingLocal.lastCaptured || remoteBm.lastCaptured || remoteMeta.lastCaptured || Date.now())
          : undefined,
        archive: restoredArchiveSummaries.get(targetId) || existingLocal.archive,
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

    // 5. Restore synced settings (preferences & theme — credentials are never synced)
    let restoredSettings = false;
    if (vaultIndex.settings?.preferences && typeof vaultIndex.settings.preferences === "object") {
      await saveUserPreferences(vaultIndex.settings.preferences);
      restoredSettings = true;
    }
    if (vaultIndex.settings?.theme === "dark" || vaultIndex.settings?.theme === "light") {
      await saveTheme(vaultIndex.settings.theme);
      restoredSettings = true;
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
    if (restoredArchivesCount > 0) parts.push(`restored ${restoredArchivesCount} page archives`);
    if (restoredSettings) parts.push("restored settings");

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
