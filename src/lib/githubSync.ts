import { GitHubConfig, EnhancedBookmark, BookmarkMetadata, FolderNode } from "./types";
import { saveGitHubConfig, getAllMetadata, bulkUpdateMetadata, saveBookmarkMetadata } from "./metadataStore";
import { getEnhancedBookmarkTree, extractAllBookmarks, extractFolderTree, createBookmark } from "./chromeBookmarks";
import { getDomain } from "./utils";

// Robust sanitization helper for GitHub configurations
export function sanitizeGitHubConfig(config: GitHubConfig): GitHubConfig {
  let owner = (config.owner || "").trim();
  let repo = (config.repo || "").trim();
  let token = (config.token || "").trim();
  let branch = (config.branch || "").trim() || "main";

  // Clean quotes and token prefixes (e.g. Bearer or token)
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

  // Clean trailing .git or slashes
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

// Standardized GitHub API Headers
export function getGitHubHeaders(token: string): Record<string, string> {
  const cleanToken = (token || "").replace(/^(Bearer|token)\s+/i, "").trim();
  return {
    Authorization: `Bearer ${cleanToken}`,
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Robust UTF-8 Base64 Encoding & Decoding (safe for all unicode and large strings)
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

export function base64ToUtf8(str: string): string {
  const clean = (str || "").replace(/[\r\n\s]/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function sanitizePathSegment(name: string): string {
  return (name || "untitled")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim() || "item";
}

// Helper for concurrency controlled promises
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

// Generate rich, beautiful markdown catalog for GitHub repository browse mode
export function generateMarkdownReadme(
  bookmarks: EnhancedBookmark[],
  folderMap: Record<string, string>
): string {
  const dateStr = new Date().toLocaleString();
  const starred = bookmarks.filter((b) => b.isFavorite).length;

  let md = `# 📑 Personal Bookmarks Vault\n\n`;
  md += `> Automatically organized, backed up, and version-controlled with [Noob31 Bookmark Vault](https://noob31.com)\n\n`;
  md += `### 📊 Vault Overview\n\n`;
  md += `| Total Bookmarks | ⭐ Starred | Last Synchronized |\n`;
  md += `| :---: | :---: | :---: |\n`;
  md += `| **${bookmarks.length}** | **${starred}** | \`${dateStr}\` |\n\n`;
  md += `---\n\n`;

  // Group bookmarks by folder
  const grouped: Record<string, EnhancedBookmark[]> = {};
  for (const b of bookmarks) {
    const folder = folderMap[b.parentId || ""] || "Bookmarks Bar";
    if (!grouped[folder]) grouped[folder] = [];
    grouped[folder].push(b);
  }

  for (const [folderName, items] of Object.entries(grouped)) {
    md += `## 📁 ${folderName} (${items.length})\n\n`;
    for (const b of items) {
      const star = b.isFavorite ? "⭐ " : "";
      const domain = getDomain(b.url);
      const tags = b.tags && b.tags.length > 0 ? ` • ${b.tags.map((t) => `\`#${t}\``).join(" ")}` : "";
      const statusBadge = b.httpStatus ? ` \`[${b.httpStatus}]\`` : "";
      const safeTitle = (b.title || "Untitled").replace(/[\[\]]/g, "\\$&");
      const safeUrl = b.url || "#";

      md += `- ${star}[${safeTitle}](${safeUrl}) — *${domain}*${statusBadge}${tags}\n`;
      if (b.description || b.notes) {
        const note = (b.description || b.notes || "").replace(/\n+/g, " ");
        md += `  > ${note}\n`;
      }
    }
    md += `\n`;
  }

  return md;
}

// Check GitHub repo accessibility, token validity, and branch detection
export async function testGitHubConnection(
  rawConfig: GitHubConfig
): Promise<{ ok: boolean; message: string; user?: string; defaultBranch?: string }> {
  const config = sanitizeGitHubConfig(rawConfig);
  if (!config.token || !config.owner || !config.repo) {
    return { ok: false, message: "Personal Access Token, Owner, and Repository name are all required." };
  }

  try {
    const headers = getGitHubHeaders(config.token);
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
      { headers }
    );

    if (res.status === 200) {
      const data = await res.json();
      const defaultBranch = data.default_branch || "main";
      return {
        ok: true,
        message: `Successfully connected to ${data.full_name} (${data.private ? "Private" : "Public"}) • Default branch: "${defaultBranch}"`,
        user: data.owner?.login,
        defaultBranch,
      };
    }

    if (res.status === 401) {
      return {
        ok: false,
        message: "Invalid GitHub Personal Access Token (401 Unauthorized). Please check that your token is valid and not expired.",
      };
    }

    if (res.status === 403) {
      const rateLimitRemaining = res.headers.get("x-ratelimit-remaining");
      if (rateLimitRemaining === "0") {
        return {
          ok: false,
          message: "GitHub API rate limit exceeded (403). Please wait a few moments or use an authenticated token.",
        };
      }
      return {
        ok: false,
        message: "Access Forbidden (403): Ensure your token has 'Contents: Read and write' repository permissions (for Fine-Grained tokens) or 'repo' scope (for Classic tokens).",
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        message: `Repository "${config.owner}/${config.repo}" was not found (404). Check that the owner and repository names are spelled correctly, and your token has permission to access it.`,
      };
    }

    const err = await res.json().catch(() => ({}));
    return { ok: false, message: err.message || `GitHub error: HTTP ${res.status} ${res.statusText}` };
  } catch (err: any) {
    return { ok: false, message: `Network connection error: ${err.message || err}` };
  }
}

// Fetch branch ref or detect if repository is empty / new
async function getBranchRef(
  config: GitHubConfig
): Promise<{ sha: string | null; isEmpty: boolean; defaultBranch?: string }> {
  const headers = getGitHubHeaders(config.token);
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/ref/heads/${encodeURIComponent(config.branch)}`,
      { headers }
    );

    if (res.status === 409) {
      return { sha: null, isEmpty: true };
    }

    if (res.status === 404) {
      // Check if repo has another default branch (e.g. master vs main) or is brand new
      try {
        const repoRes = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
          { headers }
        );
        if (repoRes.ok) {
          const repoData = await repoRes.json();
          if (repoData.size === 0) {
            return { sha: null, isEmpty: true, defaultBranch: repoData.default_branch };
          }
          if (repoData.default_branch && repoData.default_branch !== config.branch) {
            const defaultRefRes = await fetch(
              `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/ref/heads/${encodeURIComponent(repoData.default_branch)}`,
              { headers }
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
      } catch {}
      return { sha: null, isEmpty: false };
    }

    if (res.ok) {
      const data = await res.json();
      return { sha: data.object?.sha || null, isEmpty: false };
    }
  } catch (err) {
    console.error("Error fetching branch ref", err);
  }
  return { sha: null, isEmpty: false };
}

// Initialize an empty repository with an initial commit using contents API
async function initializeEmptyRepo(config: GitHubConfig): Promise<string | null> {
  const headers = getGitHubHeaders(config.token);
  try {
    const initBody = {
      message: "[Initial Commit] Initialize Bookmarks Vault Repository",
      content: utf8ToBase64("# 📑 Bookmarks Vault\n\nInitializing repository..."),
      branch: config.branch,
    };
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/README.md`,
      {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initBody),
      }
    );
    if (res.ok) {
      const data = await res.json();
      return data.commit?.sha || null;
    }
  } catch (err) {
    console.error("Failed to initialize empty repo", err);
  }
  return null;
}

// Create a Git Blob (for binary screenshots or large text)
async function createGitBlob(
  config: GitHubConfig,
  content: string,
  encoding: "utf-8" | "base64" = "utf-8"
): Promise<string | null> {
  const headers = getGitHubHeaders(config.token);
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/blobs`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, encoding }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      return data.sha;
    }
  } catch (err) {
    console.error("Failed to create git blob", err);
  }
  return null;
}

// Push all bookmarks & metadata to GitHub with automatic conflict resolution & clean state
export async function syncVaultToGitHub(
  rawConfig: GitHubConfig
): Promise<{ success: boolean; message: string; timestamp: number }> {
  const config = sanitizeGitHubConfig(rawConfig);
  if (!config.token || !config.owner || !config.repo) {
    return {
      success: false,
      message: "Personal Access Token, Owner, and Repository name are required.",
      timestamp: Date.now(),
    };
  }

  await saveGitHubConfig({ ...config, syncStatus: "syncing", lastSyncError: undefined });

  try {
    const tree = await getEnhancedBookmarkTree();
    const flatList = extractAllBookmarks(tree);
    const folderTree = extractFolderTree(tree);
    const metadata = await getAllMetadata();

    // 1. Check if repo is empty or if target branch ref exists
    let { sha: parentCommitSha, isEmpty, defaultBranch } = await getBranchRef(config);
    if (isEmpty || !parentCommitSha) {
      const initSha = await initializeEmptyRepo(config);
      if (initSha) {
        parentCommitSha = initSha;
      } else {
        const recheck = await getBranchRef(config);
        parentCommitSha = recheck.sha;
      }
    }

    // 2. Map folder IDs to clean folder paths
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

    // 3. Collect existing non-vault files to preserve (e.g. .github/ workflows, LICENSE, .gitignore)
    const preservedNonVaultItems: Array<{
      path: string;
      mode: "100644" | "100755" | "040000" | "160000" | "120000";
      type: "blob" | "tree" | "commit";
      sha: string;
    }> = [];

    if (parentCommitSha) {
      try {
        const headers = getGitHubHeaders(config.token);
        const commitRes = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/commits/${parentCommitSha}`,
          { headers }
        );
        if (commitRes.ok) {
          const commitData = await commitRes.json();
          const baseTreeSha = commitData.tree?.sha;
          if (baseTreeSha) {
            const treeRes = await fetch(
              `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/trees/${baseTreeSha}?recursive=1`,
              { headers }
            );
            if (treeRes.ok) {
              const baseTreeData = await treeRes.json();
              for (const item of baseTreeData.tree || []) {
                if (
                  item.type === "blob" &&
                  !item.path.startsWith("bookmarks/") &&
                  !item.path.startsWith("assets/") &&
                  !item.path.startsWith(".noob31/") &&
                  item.path !== "README.md" &&
                  item.path !== "bookmarks-vault.json"
                ) {
                  preservedNonVaultItems.push({
                    path: item.path,
                    mode: item.mode || "100644",
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

    // 4. Build Tree Items with Map for deduplication
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

    // .noob31/vault-index.json (Complete structured vault snapshot)
    const vaultIndex = {
      version: "2.1.0",
      syncedAt: new Date().toISOString(),
      bookmarkCount: flatList.length,
      tree,
      bookmarks: flatList,
      metadata,
    };

    treeMap.set(".noob31/vault-index.json", {
      path: ".noob31/vault-index.json",
      mode: "100644",
      type: "blob",
      content: JSON.stringify(vaultIndex, null, 2),
    });

    // README.md (Browsing catalog)
    const readmeContent = generateMarkdownReadme(flatList, folderMap);
    treeMap.set("README.md", {
      path: "README.md",
      mode: "100644",
      type: "blob",
      content: readmeContent,
    });

    // Process bookmark JSON files and upload binary screenshots concurrently
    const screenshotUploadTasks: Array<{ id: string; base64: string; existingSha?: string }> = [];

    for (const b of flatList) {
      const folderPath = folderMap[b.parentId || ""] || "Bookmarks Bar";
      const fileSlug = sanitizePathSegment(b.title || b.id).slice(0, 50);
      const filePath = `bookmarks/${folderPath}/${fileSlug}_${b.id}.json`.replace(/\/+/g, "/");

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

    // Upload screenshots concurrently (5 at a time)
    if (screenshotUploadTasks.length > 0) {
      await runWithConcurrency(screenshotUploadTasks, 5, async (task) => {
        try {
          const blobSha = task.existingSha || (await createGitBlob(config, task.base64, "base64"));
          if (blobSha) {
            treeMap.set(`assets/screenshots/${task.id}.webp`, {
              path: `assets/screenshots/${task.id}.webp`,
              mode: "100644",
              type: "blob",
              sha: blobSha,
            });
            if (!task.existingSha) {
              await saveBookmarkMetadata(task.id, { githubSha: blobSha });
            }
          }
        } catch (blobErr) {
          console.warn(`Failed to upload screenshot blob for bookmark ${task.id}`, blobErr);
        }
      });
    }

    // Add preserved non-vault items
    for (const item of preservedNonVaultItems) {
      if (!treeMap.has(item.path)) {
        treeMap.set(item.path, item as any);
      }
    }

    const treeItems = Array.from(treeMap.values());

    // 5. Create Git Tree (clean state without ghost files)
    const headers = getGitHubHeaders(config.token);
    const createTreeRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/trees`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tree: treeItems }),
      }
    );

    if (!createTreeRes.ok) {
      const err = await createTreeRes.json().catch(() => ({}));
      throw new Error(`Tree creation failed: ${err.message || createTreeRes.status}`);
    }
    const treeData = await createTreeRes.json();
    const newTreeSha = treeData.sha;

    // 6. Create Git Commit
    const commitPayload: any = {
      message: `[Vault Sync] Synchronized ${flatList.length} bookmarks across ${Object.keys(folderMap).length} folders (${new Date().toLocaleDateString()})`,
      tree: newTreeSha,
      parents: parentCommitSha ? [parentCommitSha] : [],
    };

    const createCommitRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/commits`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commitPayload),
      }
    );

    if (!createCommitRes.ok) {
      const err = await createCommitRes.json().catch(() => ({}));
      throw new Error(`Commit creation failed: ${err.message || createCommitRes.status}`);
    }
    const commitData = await createCommitRes.json();
    const newCommitSha = commitData.sha;

    // 7. Update branch reference (or create it if it doesn't exist)
    let updateRefRes = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/refs/heads/${encodeURIComponent(config.branch)}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sha: newCommitSha, force: true }),
      }
    );

    if (!updateRefRes.ok && updateRefRes.status === 404) {
      const createRefRes = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/refs`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha: newCommitSha }),
        }
      );

      if (!createRefRes.ok) {
        updateRefRes = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/refs/heads/${encodeURIComponent(config.branch)}`,
          {
            method: "PATCH",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sha: newCommitSha, force: true }),
          }
        );
      }
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
      message: `Pushed ${flatList.length} bookmarks to ${config.owner}/${config.repo} (${treeItems.length} organized files & assets)!`,
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

// Fetch raw vault index from GitHub (handling > 1MB files and Git tree fallback)
async function fetchRawVaultIndex(config: GitHubConfig): Promise<any | null> {
  const headers = getGitHubHeaders(config.token);
  const targetPaths = [`.noob31/vault-index.json`, `bookmarks-vault.json`];

  for (const filePath of targetPaths) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${filePath}?ref=${encodeURIComponent(config.branch)}`,
        { headers }
      );

      if (res.ok) {
        const data = await res.json();
        // 1. Direct Base64 content (files <= 1MB)
        if (data.content) {
          const jsonStr = base64ToUtf8(data.content);
          return JSON.parse(jsonStr);
        }

        // 2. Git Blob API for larger files (> 1MB)
        if (data.sha) {
          const blobRes = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/blobs/${data.sha}`,
            {
              headers: {
                ...headers,
                Accept: "application/vnd.github.raw+json",
              },
            }
          );
          if (blobRes.ok) {
            const rawText = await blobRes.text();
            return JSON.parse(rawText);
          }
        }

        // 3. Download URL
        if (data.download_url) {
          const downloadRes = await fetch(data.download_url, { headers });
          if (downloadRes.ok) {
            return await downloadRes.json();
          }
        }
      }
    } catch (err) {
      console.warn(`Could not read ${filePath}`, err);
    }
  }

  // 4. Fallback: Reconstruct vault from individual bookmarks JSON files in the Git Tree
  try {
    const { sha: branchSha } = await getBranchRef(config);
    if (branchSha) {
      const commitRes = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/commits/${branchSha}`,
        { headers }
      );
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        const treeSha = commitData.tree?.sha;
        if (treeSha) {
          const treeRes = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/trees/${treeSha}?recursive=1`,
            { headers }
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
                  const bRes = await fetch(
                    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/blobs/${node.sha}`,
                    { headers: { ...headers, Accept: "application/vnd.github.raw+json" } }
                  );
                  if (bRes.ok) {
                    const text = await bRes.text();
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
    console.error("Fallback tree reconstruction failed", err);
  }

  return null;
}

// Pull & restore bookmarks & metadata from GitHub (with URL-based matching & Chrome bookmark restoration)
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
        message: `No vault index or bookmark records found in repository "${config.owner}/${config.repo}" on branch "${config.branch}".`,
        count: 0,
      };
    }

    const localTree = await getEnhancedBookmarkTree();
    const localBookmarks = extractAllBookmarks(localTree);

    // Map existing Chrome bookmarks by normalized URL
    const urlToLocalBookmark = new Map<string, EnhancedBookmark>();
    for (const b of localBookmarks) {
      if (b.url) {
        urlToLocalBookmark.set(b.url.trim().toLowerCase(), b);
      }
    }

    const remoteBookmarks: EnhancedBookmark[] =
      vault.bookmarks || (vault.tree ? extractAllBookmarks(vault.tree) : []);
    const remoteMetadata: Record<string, BookmarkMetadata> = vault.metadata || {};

    let createdCount = 0;
    let updatedCount = 0;
    const metadataUpdates: Record<string, Partial<BookmarkMetadata>> = {};

    // 1. Process all remote bookmarks
    for (const rb of remoteBookmarks) {
      if (!rb.url) continue;
      const normalizedUrl = rb.url.trim().toLowerCase();
      let targetLocal = urlToLocalBookmark.get(normalizedUrl);

      // Recreate bookmark in Chrome if missing
      if (!targetLocal && options.restoreBookmarks) {
        try {
          const created = await createBookmark({
            parentId: "1", // Default Bookmarks Bar
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
          console.warn(`Could not restore bookmark ${rb.url}`, createErr);
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

    // 2. Also map any raw metadata from remoteMetadata
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
