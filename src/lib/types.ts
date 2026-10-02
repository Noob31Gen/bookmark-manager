export interface BookmarkMetadata {
  tags?: string[];
  description?: string;
  notes?: string;
  ogImage?: string;
  screenshot?: string; // Data URL or GitHub Asset URL
  favicon?: string;
  isFavorite?: boolean;
  readerContent?: string;
  lastCaptured?: number;
  githubSha?: string;
}

export interface EnhancedBookmark {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  dateAdded?: number;
  dateGroupModified?: number;
  index?: number;
  isFolder: boolean;
  children?: EnhancedBookmark[];
  
  // Metadata enhancements
  tags: string[];
  description?: string;
  notes?: string;
  ogImage?: string;
  screenshot?: string;
  favicon?: string;
  isFavorite?: boolean;
  readerContent?: string;
  lastCaptured?: number;
}

export interface GitHubConfig {
  enabled: boolean;
  token: string;
  owner: string;
  repo: string;
  branch: string;
  autoSync: boolean;
  syncIntervalMinutes: number;
  lastSyncTime?: number;
  syncStatus?: "idle" | "syncing" | "success" | "error";
  lastSyncError?: string;
}

export interface FolderNode {
  id: string;
  title: string;
  parentId?: string;
  children?: FolderNode[];
  bookmarkCount: number;
}

export type ViewMode = "grid" | "cards" | "list";

export interface ExtractedPageData {
  title: string;
  url: string;
  description: string;
  ogImage?: string;
  favicon?: string;
  suggestedTags: string[];
  readerText?: string;
  screenshot?: string;
}
