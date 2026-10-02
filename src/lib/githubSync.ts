import { GitHubConfig, EnhancedBookmark, BookmarkMetadata } from "./types";
import { saveGitHubConfig, getAllMetadata, bulkUpdateMetadata } from "./metadataStore";
import { getEnhancedBookmarkTree, extractAllBookmarks } from "./chromeBookmarks";

// Helper for UTF-8 Base64 Encoding and Decoding
function utf8ToBase64(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

function base64ToUtf8(str: string): string {
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str), (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}

// Check GitHub repo accessibility and token validity
export async function testGitHubConnection(
  config: GitHubConfig
): Promise<{ ok: boolean; message: string; user?: string }> {
  if (!config.token || !config.owner || !config.repo) {
    return { ok: false, message: "Token, owner, and repository are required." };
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
        message: `Successfully connected to repository ${data.full_name} (${data.private ? "Private" : "Public"})`,
        user: data.owner?.login,
      };
    }

    if (res.status === 401) {
      return { ok: false, message: "Invalid GitHub Personal Access Token (401 Unauthorized)." };
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

// Fetch file SHA from repo
async function getFileSha(
  config: GitHubConfig,
  path: string
): Promise<{ sha?: string; content?: string }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${config.branch || "main"}`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (res.status === 200) {
      const data = await res.json();
      return { sha: data.sha, content: data.content };
    }
    return {};
  } catch {
    return {};
  }
}

// Push a single asset (e.g. screenshot base64) to GitHub
export async function uploadAssetToGitHub(
  config: GitHubConfig,
  assetPath: string,
  base64Data: string,
  commitMessage: string
): Promise<string | null> {
  if (!config.token || !config.owner || !config.repo) return null;

  try {
    // Strip data:image/...;base64, prefix if present
    const cleanBase64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
    const { sha } = await getFileSha(config, assetPath);

    const body: Record<string, any> = {
      message: commitMessage,
      content: cleanBase64,
      branch: config.branch || "main",
    };
    if (sha) body.sha = sha;

    const res = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${assetPath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (res.ok) {
      const data = await res.json();
      return data.content?.download_url || `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch || "main"}/${assetPath}`;
    }
  } catch (err) {
    console.error(`Failed to upload asset ${assetPath} to GitHub`, err);
  }
  return null;
}

// Push all bookmarks & metadata to GitHub
export async function syncVaultToGitHub(
  config: GitHubConfig
): Promise<{ success: boolean; message: string; timestamp: number }> {
  if (!config.enabled || !config.token || !config.owner || !config.repo) {
    return { success: false, message: "GitHub sync is not properly configured.", timestamp: Date.now() };
  }

  await saveGitHubConfig({ syncStatus: "syncing", lastSyncError: undefined });

  try {
    const tree = await getEnhancedBookmarkTree();
    const flatList = extractAllBookmarks(tree);
    const metadata = await getAllMetadata();

    const vaultPayload = {
      version: "1.0.0",
      syncedAt: new Date().toISOString(),
      bookmarkCount: flatList.length,
      tree,
      metadata,
    };

    const jsonString = JSON.stringify(vaultPayload, null, 2);
    const base64Content = utf8ToBase64(jsonString);

    const { sha } = await getFileSha(config, "bookmarks-vault.json");

    const commitBody: Record<string, any> = {
      message: `[Vault Sync] Update bookmarks vault (${flatList.length} items) - ${new Date().toLocaleDateString()}`,
      content: base64Content,
      branch: config.branch || "main",
    };
    if (sha) commitBody.sha = sha;

    const res = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/contents/bookmarks-vault.json`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commitBody),
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${res.status}`);
    }

    // Optional: Upload screenshots to assets/screenshots/
    const bookmarksWithScreenshots = flatList.filter((b) => b.screenshot && b.screenshot.startsWith("data:"));
    for (const b of bookmarksWithScreenshots.slice(0, 5)) { // batch upload up to 5 per sync
      if (b.screenshot) {
        await uploadAssetToGitHub(
          config,
          `assets/screenshots/${b.id}.webp`,
          b.screenshot,
          `[Asset] Upload screenshot for ${b.title}`
        );
      }
    }

    const timestamp = Date.now();
    await saveGitHubConfig({
      syncStatus: "success",
      lastSyncTime: timestamp,
      lastSyncError: undefined,
    });

    return {
      success: true,
      message: `Successfully synced ${flatList.length} bookmarks to GitHub repository ${config.owner}/${config.repo}!`,
      timestamp,
    };
  } catch (err: any) {
    const errorMsg = err.message || "Failed to sync to GitHub";
    await saveGitHubConfig({
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
  config: GitHubConfig
): Promise<{ success: boolean; message: string; count: number }> {
  if (!config.token || !config.owner || !config.repo) {
    return { success: false, message: "Missing GitHub credentials.", count: 0 };
  }

  try {
    const { content } = await getFileSha(config, "bookmarks-vault.json");
    if (!content) {
      return { success: false, message: "No bookmarks-vault.json found in remote repository.", count: 0 };
    }

    const jsonStr = base64ToUtf8(content.replace(/\s/g, ""));
    const vault = JSON.parse(jsonStr);

    if (vault.metadata) {
      await bulkUpdateMetadata(vault.metadata);
    }

    return {
      success: true,
      message: `Successfully restored vault with ${vault.bookmarkCount || 0} bookmarks from GitHub!`,
      count: vault.bookmarkCount || 0,
    };
  } catch (err: any) {
    return { success: false, message: `Restore failed: ${err.message}`, count: 0 };
  }
}
