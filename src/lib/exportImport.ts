import { EnhancedBookmark, BookmarkMetadata } from "./types";
import { getEnhancedBookmarkTree, extractAllBookmarks, createBookmark } from "./chromeBookmarks";
import { getAllMetadata, bulkUpdateMetadata } from "./metadataStore";

// Export entire vault as JSON
export async function exportVaultAsJSON(): Promise<string> {
  const tree = await getEnhancedBookmarkTree();
  const flat = extractAllBookmarks(tree);
  const metadata = await getAllMetadata();

  const vault = {
    appName: "Noob31 Bookmark Vault",
    version: "1.0.0",
    exportDate: new Date().toISOString(),
    totalBookmarks: flat.length,
    tree,
    metadata,
  };

  return JSON.stringify(vault, null, 2);
}

// Export bookmarks as Netscape HTML format
export async function exportBookmarksAsNetscapeHTML(): Promise<string> {
  const tree = await getEnhancedBookmarkTree();

  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

  function renderNode(node: EnhancedBookmark, indent: string): string {
    let result = "";
    if (node.isFolder) {
      result += `${indent}<DT><H3 ADD_DATE="${Math.floor((node.dateAdded || Date.now()) / 1000)}">${escapeHtml(node.title)}</H3>\n`;
      result += `${indent}<DL><p>\n`;
      if (node.children) {
        for (const child of node.children) {
          result += renderNode(child, indent + "    ");
        }
      }
      result += `${indent}</DL><p>\n`;
    } else if (node.url) {
      const tagsAttr = node.tags.length > 0 ? ` TAGS="${escapeHtml(node.tags.join(","))}"` : "";
      const iconAttr = node.favicon ? ` ICON="${escapeHtml(node.favicon)}"` : "";
      result += `${indent}<DT><A HREF="${escapeHtml(node.url)}" ADD_DATE="${Math.floor((node.dateAdded || Date.now()) / 1000)}"${tagsAttr}${iconAttr}>${escapeHtml(node.title)}</A>\n`;
      if (node.description || node.notes) {
        result += `${indent}<DD>${escapeHtml(node.description || node.notes || "")}\n`;
      }
    }
    return result;
  }

  for (const root of tree) {
    if (root.children) {
      for (const child of root.children) {
        html += renderNode(child, "    ");
      }
    }
  }

  html += `</DL><p>\n`;
  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Download file trigger helper
export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Import JSON vault backup
export async function importVaultFromJSON(
  jsonString: string
): Promise<{ success: boolean; count: number; message: string }> {
  try {
    const vault = JSON.parse(jsonString);
    if (!vault.metadata && !vault.tree) {
      return { success: false, count: 0, message: "Invalid JSON backup format." };
    }

    if (vault.metadata) {
      await bulkUpdateMetadata(vault.metadata);
    }

    return {
      success: true,
      count: vault.totalBookmarks || Object.keys(vault.metadata || {}).length,
      message: "Successfully imported metadata & vault settings!",
    };
  } catch (err: any) {
    return { success: false, count: 0, message: err.message || "Failed to parse JSON file" };
  }
}
