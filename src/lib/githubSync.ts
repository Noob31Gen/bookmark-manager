import { GitHubConfig, EnhancedBookmark, BookmarkMetadata, FolderNode } from "./types";
import { saveGitHubConfig, getAllMetadata, bulkUpdateMetadata } from "./metadataStore";
import { getEnhancedBookmarkTree, extractAllBookmarks, extractFolderTree } from "./chromeBookmarks";
import { getDomain } from "./utils";

// Robust sanitization helper for GitHub configurations
export function sanitizeGitHubConfig(config: GitHubConfig): GitHubConfig {
  let owner = (config.owner || "").trim();
  let repo = (config.repo || "").trim();
  const token = (config.token || "").trim();
  const branch = (config.branch || "").trim() || "main";

  // Handle URL pasted into owner or repo (e.g. https://github.com/Noob31Gen/bookmark-vault)
  if (owner.includes("github.com/")) {
    const parts = owner.split("github.com/")[1].split("/").filter(Boolean);
    if (parts.length >= 1) owner = parts[0];
    if (parts.length >= 2 && !repo) repo = parts[1].replace(/\.git$/, "");
  } else if (owner.includes("/")) {
    const parts = owner.split("/").filter(Boolean);
    if (parts.length >= 1) owner = parts[0];
    if (parts.length >= 2 && !repo) repo = parts[1].replace(/\.git$/, "");
  }

  if (repo.includes("github.com/")) {
    const parts = repo.split("github.com/")[1].split("/").filter(Boolean);
    if (parts.length >= 2) {
      owner = parts[0];
      repo = parts[1].replace(/\.git$/, "");
    } else if (parts.length === 1) {
      repo = parts[0].replace(/\.git$/, "");
    }
  } else if (repo.includes("/")) {
    const parts = repo.split("/").filter(Boolean);
    if (parts.length >= 2) {
      owner = parts[0];
      repo = parts[1].replace(/\.git$/, "");
    }
  }

  repo = repo.replace(/\.git$/, "");

  return {
    ...config,
    owner,
    repo,
    token,
    branch,
    enabled: !!(token && owner && repo),
  };
}

// Robust UTF-8 Base64 Encoding and Decoding (chunked to prevent call stack limits)
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToUtf8(str: string): string {
  const binary = atob(str.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function sanitizePathSegment(name: string): string {
  return (name || "untitled")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "item";
}

// Generate beautiful markdown catalog
function generateMarkdownReadme(bookmarks: EnhancedBookmark[], folderMap: Record<string, string>): string {
  const dateStr = new Date().toLocaleString();
  let md = `# 📑 Personal Bookmarks Vault\n\n`;
  md += `> Automatically organized, backed up, and version-controlled with [Noob31 Bookmark Vault](https://noob31.com)\n\n`;
  md += `### 📊 Vault Overview\n`;
  md += `- **Total Bookmarks:** ${bookmarks.length}\n`;
  md += `- **Starred Bookmarks:** ${bookmarks.filter((b) => b.isFavorite).length}\n`;
  md += `- **Last Synchronized:** ${dateStr}\n\n`;
  md += `---\n\n`;

  // Group by folder
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
      md += `- ${star}[${b.title || "Untitled"}](${b.url || "#"}) — *${domain}*${statusBadge}${tags}\n`;
      if (b.description || b.notes) {
        md += `  > ${b.description || b.notes}\n`;
      }
    }
    md += `\n`;
  }

  return md;
}

// Check GitHub repo accessibility and token validity
export async function testGitHubConnection(
  rawConfig: GitHubConfig
): Promise<{ ok: boolean; message: string; user?: string; defaultBranch?: string }> {
  const config = sanitizeGitHubConfig(rawConfig);
  if (!config.token || !config.owner || !config.repo) {
    return { ok: false, message: "Personal Access Token, Owner, and Repository name are required." };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}`, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (res.status === 200) {
      const data = await res.json();
      return {
        ok: true,
        message: `Connected to ${data.full_name} (${data.private ? "Private" : "Public"}) • Default branch: ${data.default_branch}`,
        user: data.owner?.login,
        defaultBranch: data.default_branch,
      };
    }

    if (res.status === 401) {
      return { ok: false, message: "Invalid GitHub Personal Access Token (401 Unauthorized)." };
    }

    if (res.status === 403) {
      return { ok: false, message: "Token lacks permissions or GitHub API rate limit exceeded (403 Forbidden)." };
    }

    if (res.status === 404) {
      return {
        ok: false,
        message: `Repository "${config.owner}/${config.repo}" not found or token has insufficient permissions.`,
      };
    }

    const err = await res.json().catch(() => ({}));
    return { ok: false, message: err.message || `GitHub error: HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, message: `Network error: ${err.message || err}` };
  }
}

// Fetch branch ref or detect if repository is empty
async function getBranchRef(
  config: GitHubConfig
): Promise<{ sha: string | null; isEmpty: boolean }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(config.branch)}`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    if (res.status === 409) {
      return { sha: null, isEmpty: true };
    }
    if (res.status === 404) {
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
  try {
    const initBody = {
      message: "[Initial Commit] Initialize Bookmarks Vault Repository",
      content: utf8ToBase64("# 📑 Bookmarks Vault\n\nInitializing repository..."),
      branch: config.branch,
    };
    const res = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/README.md`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github.v3+json",
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

// Create a Git Blob (for binary/screenshots or text)
async function createGitBlob(
  config: GitHubConfig,
  content: string,
  encoding: "utf-8" | "base64" = "utf-8"
): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/git/blobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, encoding }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.sha;
    }
  } catch (err) {
    console.error("Failed to create git blob", err);
  }
  return null;
}

// Push all bookmarks & metadata to GitHub with automatic conflict resolution & force push
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

    // 1. Check if repo is empty or ref exists
    let { sha: parentCommitSha, isEmpty } = await getBranchRef(config);
    if (isEmpty || !parentCommitSha) {
      // Auto-initialize empty repository so Git Data API endpoints work
      const initSha = await initializeEmptyRepo(config);
      if (initSha) {
        parentCommitSha = initSha;
      } else {
        // Re-check branch ref
        const recheck = await getBranchRef(config);
        parentCommitSha = recheck.sha;
      }
    }

    // 2. Map folder IDs to folder titles
    const folderMap: Record<string, string> = {};
    function buildFolderMap(nodes: FolderNode[], prefix = "") {
      for (const n of nodes) {
        const fullPath = prefix ? `${prefix}/${sanitizePathSegment(n.title)}` : sanitizePathSegment(n.title);
        folderMap[n.id] = fullPath;
        if (n.children) buildFolderMap(n.children, fullPath);
      }
    }
    buildFolderMap(folderTree);

    // 3. Build the Git Tree items
    const treeItems: Array<{
      path: string;
      mode: "100644";
      type: "blob";
      content?: string;
      sha?: string;
    }> = [];

    // .noob31/vault-index.json (Complete index for rapid pull/restore)
    const vaultIndex = {
      version: "2.0.0",
      syncedAt: new Date().toISOString(),
      bookmarkCount: flatList.length,
      tree,
      metadata,
    };
    treeItems.push({
      path: ".noob31/vault-index.json",
      mode: "100644",
      type: "blob",
      content: JSON.stringify(vaultIndex, null, 2),
    });

    // README.md (Browseable directory on GitHub)
    const readmeContent = generateMarkdownReadme(flatList, folderMap);
    treeItems.push({
      path: "README.md",
      mode: "100644",
      type: "blob",
      content: readmeContent,
    });

    // Individual bookmark files: bookmarks/[folder]/[clean_title]_[id].json
    for (const b of flatList) {
      const folderPath = folderMap[b.parentId || ""] || "Bookmarks Bar";
      const fileSlug = sanitizePathSegment(b.title || b.id).slice(0, 50);
      const filePath = `bookmarks/${folderPath}/${fileSlug}_${b.id}.json`;

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

      treeItems.push({
        path: filePath,
        mode: "100644",
        type: "blob",
        content: JSON.stringify(cleanBookmark, null, 2),
      });

      // If bookmark has a screenshot, upload as real image in assets/screenshots/
      if (b.screenshot && b.screenshot.startsWith("data:image/")) {
        const base64Data = b.screenshot.split(",")[1];
        if (base64Data) {
          const blobSha = await createGitBlob(config, base64Data, "base64");
          if (blobSha) {
            treeItems.push({
              path: `assets/screenshots/${b.id}.webp`,
              mode: "100644",
              type: "blob",
              sha: blobSha,
            });
          }
        }
      }
    }

    // 4. Retrieve base tree SHA from parent commit if available
    let baseTreeSha: string | null = null;
    if (parentCommitSha) {
      try {
        const commitRes = await fetch(
          `https://api.github.com/repos/${config.owner}/${config.repo}/git/commits/${parentCommitSha}`,
          {
            headers: {
              Authorization: `Bearer ${config.token}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );
        if (commitRes.ok) {
          const commitData = await commitRes.json();
          baseTreeSha = commitData.tree?.sha || null;
        }
      } catch (err) {
        console.warn("Could not fetch parent commit tree", err);
      }
    }

    // 5. Create Git Tree
    const treePayload: any = { tree: treeItems };
    if (baseTreeSha) {
      treePayload.base_tree = baseTreeSha;
    }

    const createTreeRes = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/git/trees`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(treePayload),
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
      message: `[Vault Sync] Synchronized ${flatList.length} bookmarks across ${Object.keys(folderMap).length} folders`,
      tree: newTreeSha,
      parents: parentCommitSha ? [parentCommitSha] : [],
    };

    const createCommitRes = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/git/commits`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github.v3+json",
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

    // 7. Force update branch reference to resolve all conflicts
    let updateRefRes = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/git/refs/heads/${encodeURIComponent(config.branch)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sha: newCommitSha, force: true }),
      }
    );

    // If branch ref doesn't exist yet, create it
    if (!updateRefRes.ok && updateRefRes.status === 404) {
      const createRefRes = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/git/refs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: `refs/heads/${config.branch}`, sha: newCommitSha }),
        }
      );
      if (!createRefRes.ok) {
        // If 422, ref might have been created concurrently, retry PATCH with force: true
        updateRefRes = await fetch(
          `https://api.github.com/repos/${config.owner}/${config.repo}/git/refs/heads/${encodeURIComponent(config.branch)}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${config.token}`,
              Accept: "application/vnd.github.v3+json",
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

// Pull & restore bookmarks & metadata from GitHub
export async function pullVaultFromGitHub(
  rawConfig: GitHubConfig
): Promise<{ success: boolean; message: string; count: number }> {
  const config = sanitizeGitHubConfig(rawConfig);
  if (!config.token || !config.owner || !config.repo) {
    return { success: false, message: "Personal Access Token, Owner, and Repository are required.", count: 0 };
  }

  try {
    // Try fetching .noob31/vault-index.json first, fallback to legacy bookmarks-vault.json
    let res = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/.noob31/vault-index.json?ref=${encodeURIComponent(config.branch)}`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!res.ok) {
      res = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/bookmarks-vault.json?ref=${encodeURIComponent(config.branch)}`,
        {
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
    }

    if (!res.ok) {
      return {
        success: false,
        message: `No vault index found in ${config.owner}/${config.repo} on branch ${config.branch}.`,
        count: 0,
      };
    }

    const data = await res.json();
    if (!data.content) {
      return { success: false, message: "Empty vault index file in repository.", count: 0 };
    }

    const jsonStr = base64ToUtf8(data.content);
    const vault = JSON.parse(jsonStr);

    if (vault.metadata) {
      await bulkUpdateMetadata(vault.metadata);
    }

    return {
      success: true,
      message: `Successfully restored metadata for ${vault.bookmarkCount || Object.keys(vault.metadata || {}).length} bookmarks from GitHub!`,
      count: vault.bookmarkCount || Object.keys(vault.metadata || {}).length,
    };
  } catch (err: any) {
    return { success: false, message: `Restore failed: ${err.message}`, count: 0 };
  }
}
