import { EnhancedBookmark, FolderNode, BookmarkMetadata } from "./types";
import { getAllMetadata, saveBookmarkMetadata, deleteBookmarkMetadata } from "./metadataStore";

const isChromeExtension = typeof chrome !== "undefined" && !!chrome.bookmarks;

// Fallback Mock Data for local preview/development
let mockBookmarks: chrome.bookmarks.BookmarkTreeNode[] = [
  {
    id: "0",
    title: "Root",
    children: [
      {
        id: "1",
        title: "Bookmarks Bar",
        children: [
          {
            id: "101",
            title: "Noob31 Portfolio & Tools",
            url: "https://noob31.com",
            dateAdded: Date.now() - 86400000 * 2,
          },
          {
            id: "102",
            title: "GitHub: Where the world builds software",
            url: "https://github.com",
            dateAdded: Date.now() - 86400000 * 5,
          },
          {
            id: "103",
            title: "Vite | Next Generation Frontend Tooling",
            url: "https://vite.dev",
            dateAdded: Date.now() - 86400000 * 7,
          },
          {
            id: "104",
            title: "Tailwind CSS v4 Documentation",
            url: "https://tailwindcss.com/docs",
            dateAdded: Date.now() - 86400000 * 10,
          },
          {
            id: "2",
            title: "Dev Tools",
            children: [
              {
                id: "201",
                title: "Chrome Extensions MV3 Documentation",
                url: "https://developer.chrome.com/docs/extensions/mv3/",
                dateAdded: Date.now() - 86400000 * 15,
              },
              {
                id: "202",
                title: "Lucide Icons",
                url: "https://lucide.dev/icons",
                dateAdded: Date.now() - 86400000 * 20,
              },
            ],
          },
        ],
      },
      {
        id: "3",
        title: "Other Bookmarks",
        children: [
          {
            id: "301",
            title: "Hacker News",
            url: "https://news.ycombinator.com",
            dateAdded: Date.now() - 86400000 * 30,
          },
        ],
      },
    ],
  },
];

// Helper to flatten and enhance bookmarks tree
function transformNode(
  node: chrome.bookmarks.BookmarkTreeNode,
  metaMap: Record<string, BookmarkMetadata>
): EnhancedBookmark {
  const meta = metaMap[node.id] || {};
  const isFolder = !node.url && !!node.children;

  return {
    id: node.id,
    parentId: node.parentId,
    title: node.title || (node.url ? new URL(node.url).hostname : "Untitled"),
    url: node.url,
    dateAdded: node.dateAdded,
    dateGroupModified: node.dateGroupModified,
    index: node.index,
    isFolder,
    children: node.children
      ? node.children.map((child) => transformNode(child, metaMap))
      : undefined,
    tags: meta.tags || [],
    description: meta.description,
    notes: meta.notes,
    ogImage: meta.ogImage,
    screenshot: meta.screenshot,
    favicon: meta.favicon,
    isFavorite: meta.isFavorite || false,
    readerContent: meta.readerContent,
    lastCaptured: meta.lastCaptured,
    githubSha: meta.githubSha,
    fetchedTitle: meta.fetchedTitle,
    httpStatus: meta.httpStatus,
    httpStatusText: meta.httpStatusText,
    finalUrl: meta.finalUrl,
    isRedirect: meta.isRedirect,
    lastChecked: meta.lastChecked,
    fetchedImages: meta.fetchedImages,
    archive: meta.archive,
  };
}

export async function getEnhancedBookmarkTree(): Promise<EnhancedBookmark[]> {
  const metaMap = await getAllMetadata();

  if (isChromeExtension) {
    return new Promise((resolve) => {
      chrome.bookmarks.getTree((tree) => {
        const transformed = tree.map((node) => transformNode(node, metaMap));
        resolve(transformed);
      });
    });
  }

  // Mock Fallback
  return mockBookmarks.map((node) => transformNode(node, metaMap));
}

export function extractAllBookmarks(nodes: EnhancedBookmark[]): EnhancedBookmark[] {
  const list: EnhancedBookmark[] = [];

  function traverse(items: EnhancedBookmark[]) {
    for (const item of items) {
      if (!item.isFolder && item.url) {
        list.push(item);
      }
      if (item.children && item.children.length > 0) {
        traverse(item.children);
      }
    }
  }

  traverse(nodes);
  return list;
}

export function extractFolderTree(nodes: EnhancedBookmark[]): FolderNode[] {
  function countBookmarks(node: EnhancedBookmark): number {
    let count = 0;
    if (!node.isFolder && node.url) count++;
    if (node.children) {
      for (const child of node.children) {
        count += countBookmarks(child);
      }
    }
    return count;
  }

  function traverseFolders(items: EnhancedBookmark[]): FolderNode[] {
    const folders: FolderNode[] = [];
    for (const item of items) {
      if (item.isFolder) {
        folders.push({
          id: item.id,
          title: item.title || "Folder",
          parentId: item.parentId,
          bookmarkCount: countBookmarks(item),
          children: item.children ? traverseFolders(item.children) : [],
        });
      }
    }
    return folders;
  }

  return traverseFolders(nodes);
}

// --- CRUD Operations directly hooked to Chrome Bookmarks API ---

export async function createBookmark(params: {
  parentId?: string;
  title: string;
  url: string;
  tags?: string[];
  description?: string;
  notes?: string;
  screenshot?: string;
  ogImage?: string;
  favicon?: string;
  isFavorite?: boolean;
  readerContent?: string;
}): Promise<EnhancedBookmark> {
  const {
    parentId = "1",
    title,
    url,
    tags,
    description,
    notes,
    screenshot,
    ogImage,
    favicon,
    isFavorite,
    readerContent,
  } = params;

  let createdId = String(Date.now());
  let dateAdded = Date.now();

  if (isChromeExtension) {
    const created = await new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve, reject) => {
      chrome.bookmarks.create(
        {
          parentId: parentId || "1",
          title,
          url,
        },
        (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result);
          }
        }
      );
    });
    createdId = created.id;
    dateAdded = created.dateAdded || Date.now();
  }

  // Save metadata
  const meta: BookmarkMetadata = {
    tags: tags || [],
    description,
    notes,
    screenshot,
    ogImage,
    favicon,
    isFavorite,
    readerContent,
    lastCaptured: screenshot ? Date.now() : undefined,
  };
  await saveBookmarkMetadata(createdId, meta);

  return {
    id: createdId,
    parentId,
    title,
    url,
    dateAdded,
    isFolder: false,
    ...meta,
    tags: meta.tags || [],
  };
}

export async function updateBookmark(
  id: string,
  params: {
    title?: string;
    url?: string;
    tags?: string[];
    description?: string;
    notes?: string;
    screenshot?: string;
    ogImage?: string;
    favicon?: string;
    isFavorite?: boolean;
    readerContent?: string;
    httpStatus?: number;
    httpStatusText?: string;
    finalUrl?: string;
    isRedirect?: boolean;
    lastChecked?: number;
    fetchedImages?: string[];
  }
): Promise<void> {
  const { title, url, ...metaUpdates } = params;

  if (isChromeExtension && (title !== undefined || url !== undefined)) {
    await new Promise<void>((resolve) => {
      chrome.bookmarks.update(id, { title, url }, () => resolve());
    });
  }

  if (Object.keys(metaUpdates).length > 0) {
    await saveBookmarkMetadata(id, metaUpdates);
  }
}

export async function deleteBookmark(id: string): Promise<void> {
  if (isChromeExtension) {
    await new Promise<void>((resolve) => {
      chrome.bookmarks.remove(id, () => {
        if (chrome.runtime.lastError) {
          chrome.bookmarks.removeTree(id, () => resolve());
        } else {
          resolve();
        }
      });
    });
  }
  await deleteBookmarkMetadata(id);
}

export async function deleteMultipleBookmarks(ids: string[]): Promise<void> {
  for (const id of ids) {
    await deleteBookmark(id);
  }
}

export async function createFolder(title: string, parentId: string = "1"): Promise<string> {
  if (isChromeExtension) {
    const created = await new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
      chrome.bookmarks.create({ parentId, title }, (res) => resolve(res));
    });
    return created.id;
  }
  return `mock_folder_${Date.now()}`;
}

export async function moveBookmark(id: string, parentId: string, index?: number): Promise<void> {
  if (isChromeExtension) {
    await new Promise<void>((resolve) => {
      chrome.bookmarks.move(id, { parentId, index }, () => resolve());
    });
  }
}

export async function moveMultipleBookmarks(ids: string[], parentId: string): Promise<void> {
  for (const id of ids) {
    await moveBookmark(id, parentId);
  }
}

export async function copyMultipleBookmarks(
  bookmarks: EnhancedBookmark[],
  destinationParentId: string
): Promise<void> {
  for (const b of bookmarks) {
    if (b.url) {
      await createBookmark({
        parentId: destinationParentId,
        title: `${b.title} (Copy)`,
        url: b.url,
        tags: b.tags,
        description: b.description,
        notes: b.notes,
        screenshot: b.screenshot,
        ogImage: b.ogImage,
        favicon: b.favicon,
        isFavorite: b.isFavorite,
      });
    }
  }
}

export async function deleteMultipleFolders(folderIds: string[]): Promise<void> {
  for (const id of folderIds) {
    if (isChromeExtension) {
      await new Promise<void>((resolve) => {
        chrome.bookmarks.removeTree(id, () => resolve());
      });
    }
  }
}

export async function moveMultipleFolders(folderIds: string[], destinationParentId: string): Promise<void> {
  for (const id of folderIds) {
    if (isChromeExtension) {
      await new Promise<void>((resolve) => {
        chrome.bookmarks.move(id, { parentId: destinationParentId }, () => resolve());
      });
    }
  }
}

// --- Realtime Bookmarks Listener ---
export function subscribeToBookmarkChanges(onChange: () => void): () => void {
  if (!isChromeExtension) {
    return () => {};
  }

  const listener = () => onChange();

  chrome.bookmarks.onCreated.addListener(listener);
  chrome.bookmarks.onRemoved.addListener(listener);
  chrome.bookmarks.onChanged.addListener(listener);
  chrome.bookmarks.onMoved.addListener(listener);
  chrome.bookmarks.onChildrenReordered.addListener(listener);

  return () => {
    chrome.bookmarks.onCreated.removeListener(listener);
    chrome.bookmarks.onRemoved.removeListener(listener);
    chrome.bookmarks.onChanged.removeListener(listener);
    chrome.bookmarks.onMoved.removeListener(listener);
    chrome.bookmarks.onChildrenReordered.removeListener(listener);
  };
}

// Update Chrome bookmark titles for all bookmarks where a fetched title is available
export async function syncAllFetchedTitlesToChrome(
  bookmarks: EnhancedBookmark[]
): Promise<{ updatedCount: number }> {
  let updatedCount = 0;
  for (const b of bookmarks) {
    const targetTitle = b.fetchedTitle || b.title;
    if (targetTitle && b.url && !b.isFolder) {
      if (isChromeExtension) {
        try {
          await new Promise<void>((resolve) => {
            chrome.bookmarks.update(b.id, { title: targetTitle }, () => resolve());
          });
          updatedCount++;
        } catch {}
      }
    }
  }
  return { updatedCount };
}
