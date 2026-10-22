export type FetchScope = "all" | "embeds_only" | "status_only" | "screenshots_only";
export type ClickAction = "open_link" | "browse_mode";
export type MainViewThumbnail = "auto" | "screenshot_only" | "embed_only" | "icon_only" | "none";

export type SortField =
  | "date-desc"
  | "date-asc"
  | "title-asc"
  | "title-desc"
  | "domain-asc"
  | "http-status"
  | "starred-first";

// Summary of heavy page archive (full-page screenshot + MHTML) stored in IndexedDB
export interface ArchiveSummary {
  capturedAt: number;
  fullPageBytes?: number;
  fullPageWidth?: number;
  fullPageHeight?: number;
  mhtmlBytes?: number;
}

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
  fetchedTitle?: string; // Live parsed title from webpage
  
  // HTTP status & diagnostics
  httpStatus?: number; // 200, 301, 404, 500, etc.
  httpStatusText?: string; // "OK", "Not Found", "Server Error", "Network Timeout"
  lastChecked?: number;

  // Redirect detection
  finalUrl?: string; // Target URL if redirected
  isRedirect?: boolean;
  
  // Extra page assets
  fetchedImages?: string[];
  archive?: ArchiveSummary;
}

export interface EnhancedBookmark {
  id: string;
  parentId?: string;
  title: string;
  fetchedTitle?: string;
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
  githubSha?: string;
  httpStatus?: number;
  httpStatusText?: string;
  lastChecked?: number;

  // Redirects & extra assets
  finalUrl?: string;
  isRedirect?: boolean;
  fetchedImages?: string[];
  archive?: ArchiveSummary;
}

export interface UserPreferences {
  fetchScope: FetchScope;
  skip200OnRefetch: boolean;
  refetchErrorsOnly: boolean;
  autoUpdateChromeBookmarkTitles: boolean;
  clickAction: ClickAction;
  mainViewThumbnail: MainViewThumbnail;
  defaultSort: SortField;
  viewMode: ViewMode;
  concurrencyLimit: number;
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
  finalUrl?: string;
  isRedirect?: boolean;
  description: string;
  ogImage?: string;
  favicon?: string;
  suggestedTags: string[];
  readerText?: string;
  screenshot?: string;
  httpStatus?: number;
  httpStatusText?: string;
  fetchedImages?: string[];
}

export interface BatchFetchProgress {
  isRunning: boolean;
  total: number;
  current: number;
  currentTitle: string;
  currentUrl: string;
  successCount: number;
  errorCount: number;
  skippedCount: number;
}
