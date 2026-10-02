import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Plus,
  Sparkles,
  FolderPlus,
  AlertCircle,
  Hash,
  Folder,
  X,
  RefreshCw,
  Globe,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  HelpCircle,
  Settings,
  Star,
} from "lucide-react";
import {
  EnhancedBookmark,
  FolderNode,
  GitHubConfig,
  ViewMode,
  SortField,
  UserPreferences,
  BatchFetchProgress,
} from "../lib/types";
import {
  getEnhancedBookmarkTree,
  extractAllBookmarks,
  extractFolderTree,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  deleteMultipleBookmarks,
  moveMultipleBookmarks,
  copyMultipleBookmarks,
  deleteMultipleFolders,
  moveMultipleFolders,
  createFolder,
  subscribeToBookmarkChanges,
} from "../lib/chromeBookmarks";
import {
  getGitHubConfig,
  DEFAULT_GITHUB_CONFIG,
  getUserPreferences,
  DEFAULT_USER_PREFERENCES,
} from "../lib/metadataStore";
import {
  captureActiveTabScreenshot,
  captureBookmarkUrlScreenshot,
  runBatchTabScreenshots,
  BatchScreenshotOptions,
} from "../lib/capture";
import { runBatchRefetch, fetchLivePageDetails } from "../lib/fetcher";
import { getDomain } from "../lib/utils";
import { Header } from "../components/layout/Header";
import { Sidebar } from "../components/layout/Sidebar";
import { BookmarkCard } from "../components/BookmarkCard";
import { BookmarkListRow } from "../components/BookmarkListRow";
import { BookmarkEditModal } from "../components/BookmarkEditModal";
import { BrowseModeModal } from "../components/BrowseModeModal";
import { SettingsModal } from "../components/SettingsModal";
import { BatchActionBar } from "../components/BatchActionBar";
import { RefetchProgressModal } from "../components/RefetchProgressModal";
import { ScreenshotProgressModal } from "../components/ScreenshotProgressModal";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";

export function ManagerApp() {
  const [tree, setTree] = useState<EnhancedBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [httpCodeFilter, setHttpCodeFilter] = useState<
    "healthy" | "redirects" | "errors" | "unfetched" | null
  >(null);
  const [activeFilter, setActiveFilter] = useState<
    "all" | "starred" | "recent" | "snapshots" | "untagged"
  >("all");
  const [sortField, setSortField] = useState<SortField>("date-desc");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [gitHubConfig, setGitHubConfig] = useState<GitHubConfig>(DEFAULT_GITHUB_CONFIG);
  const [isReloading, setIsReloading] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);

  // Multi-selection state
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());

  // Batch refetch state
  const [refetchModalOpen, setRefetchModalOpen] = useState(false);
  const [refetchProgress, setRefetchProgress] = useState<BatchFetchProgress>({
    isRunning: false,
    total: 0,
    current: 0,
    currentTitle: "",
    currentUrl: "",
    successCount: 0,
    errorCount: 0,
    skippedCount: 0,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  // Batch tab screenshots state
  const [screenshotModalOpen, setScreenshotModalOpen] = useState(false);
  const [screenshotProgress, setScreenshotProgress] = useState<BatchFetchProgress>({
    isRunning: false,
    total: 0,
    current: 0,
    currentTitle: "",
    currentUrl: "",
    successCount: 0,
    errorCount: 0,
    skippedCount: 0,
  });
  const screenshotAbortControllerRef = useRef<AbortController | null>(null);

  // Modals state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<EnhancedBookmark | null>(null);
  const [browseModalOpen, setBrowseModalOpen] = useState(false);
  const [browsingBookmark, setBrowsingBookmark] = useState<EnhancedBookmark | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const refreshData = async () => {
    try {
      const data = await getEnhancedBookmarkTree();
      setTree(data);
      const gh = await getGitHubConfig();
      setGitHubConfig(gh);
      const prefs = await getUserPreferences();
      setPreferences(prefs);

      // If browsing a bookmark, refresh its instance
      if (browsingBookmark) {
        const flat = extractAllBookmarks(data);
        const updated = flat.find((b) => b.id === browsingBookmark.id);
        if (updated) setBrowsingBookmark(updated);
      }
    } catch (err) {
      console.error("Failed to load bookmarks", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReloadVault = async () => {
    setIsReloading(true);
    await refreshData();
    // Brief visual feedback
    setTimeout(() => {
      setIsReloading(false);
    }, 400);
  };

  useEffect(() => {
    refreshData();
    const unsubscribe = subscribeToBookmarkChanges(() => {
      refreshData();
    });
    return () => unsubscribe();
  }, []);

  // Global search keyboard shortcut ('/' or 'Ctrl+K') and Escape to clear selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "/" || (e.ctrlKey && e.key === "k")) && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("global-search-input")?.focus();
      }
      if (e.key === "Escape") {
        setSelectedBookmarkIds(new Set());
        setSelectedFolderIds(new Set());
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const allBookmarks = useMemo(() => extractAllBookmarks(tree), [tree]);
  const folders = useMemo(() => extractFolderTree(tree), [tree]);

  // Aggregate unique tags with counts
  const allTags = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of allBookmarks) {
      for (const t of b.tags || []) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [allBookmarks]);

  // Aggregate unique domains with counts
  const allDomains = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of allBookmarks) {
      const d = getDomain(b.url);
      if (d) counts[d] = (counts[d] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);
  }, [allBookmarks]);

  // Status breakdown counts (Healthy, Redirects, Errors, Unfetched)
  const statusCounts = useMemo(() => {
    let healthy = 0;
    let redirects = 0;
    let errors = 0;
    let unfetched = 0;

    for (const b of allBookmarks) {
      const isRedirect =
        b.isRedirect ||
        (b.httpStatus !== undefined && b.httpStatus >= 300 && b.httpStatus < 400) ||
        (!!b.finalUrl && b.finalUrl !== b.url);

      if (b.httpStatus === undefined || b.httpStatus === null) {
        unfetched++;
      } else if (isRedirect) {
        redirects++;
      } else if (b.httpStatus >= 200 && b.httpStatus < 300) {
        healthy++;
      } else {
        errors++;
      }
    }

    return { healthy, redirects, errors, unfetched };
  }, [allBookmarks]);

  // Filter bookmarks
  const filteredBookmarks = useMemo(() => {
    return allBookmarks.filter((b) => {
      // Search query filter (matches title, domain, URL, HTTP status code, tags, notes, description)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = b.title.toLowerCase().includes(q);
        const matchesUrl = b.url?.toLowerCase().includes(q);
        const matchesDomain = getDomain(b.url).toLowerCase().includes(q);
        const matchesFinalUrl = b.finalUrl?.toLowerCase().includes(q);
        const matchesHttp = b.httpStatus ? String(b.httpStatus).includes(q) : false;
        const matchesDesc = b.description?.toLowerCase().includes(q);
        const matchesNotes = b.notes?.toLowerCase().includes(q);
        const matchesTags = b.tags?.some((t) => t.toLowerCase().includes(q));

        if (
          !matchesTitle &&
          !matchesUrl &&
          !matchesDomain &&
          !matchesFinalUrl &&
          !matchesHttp &&
          !matchesDesc &&
          !matchesNotes &&
          !matchesTags
        ) {
          return false;
        }
      }

      // Folder filter
      if (selectedFolderId && b.parentId !== selectedFolderId) {
        return false;
      }

      // Tag filter
      if (selectedTag && !b.tags?.includes(selectedTag)) {
        return false;
      }

      // Domain filter
      if (selectedDomain && getDomain(b.url) !== selectedDomain) {
        return false;
      }

      // HTTP Status / Health Filter
      if (httpCodeFilter) {
        const isRedirect =
          b.isRedirect ||
          (b.httpStatus !== undefined && b.httpStatus >= 300 && b.httpStatus < 400) ||
          (!!b.finalUrl && b.finalUrl !== b.url);

        if (httpCodeFilter === "healthy") {
          if (b.httpStatus === undefined || b.httpStatus < 200 || b.httpStatus >= 300 || isRedirect) {
            return false;
          }
        } else if (httpCodeFilter === "redirects") {
          if (!isRedirect) return false;
        } else if (httpCodeFilter === "errors") {
          if (b.httpStatus === undefined || (b.httpStatus >= 200 && b.httpStatus < 400 && !isRedirect)) {
            return false;
          }
        } else if (httpCodeFilter === "unfetched") {
          if (b.httpStatus !== undefined && b.httpStatus !== null) {
            return false;
          }
        }
      }

      // Quick filter
      if (activeFilter === "starred" && !b.isFavorite) return false;
      if (activeFilter === "snapshots" && !b.screenshot) return false;
      if (activeFilter === "untagged" && b.tags && b.tags.length > 0) return false;

      return true;
    });
  }, [
    allBookmarks,
    searchQuery,
    selectedFolderId,
    selectedTag,
    selectedDomain,
    httpCodeFilter,
    activeFilter,
  ]);

  // Sort bookmarks
  const sortedBookmarks = useMemo(() => {
    const list = [...filteredBookmarks];
    switch (sortField) {
      case "date-asc":
        return list.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
      case "title-asc":
        return list.sort((a, b) => a.title.localeCompare(b.title));
      case "title-desc":
        return list.sort((a, b) => b.title.localeCompare(a.title));
      case "domain-asc":
        return list.sort((a, b) => getDomain(a.url).localeCompare(getDomain(b.url)));
      case "http-status":
        // Sort broken (4xx/5xx) first, then unchecked, then 200 OK
        return list.sort((a, b) => {
          const score = (bItem: EnhancedBookmark) => {
            if (bItem.httpStatus && bItem.httpStatus >= 400) return 3;
            if (bItem.httpStatus === undefined || bItem.httpStatus === null) return 2;
            if (bItem.httpStatus && bItem.httpStatus >= 300) return 1;
            return 0;
          };
          return score(b) - score(a);
        });
      case "starred-first":
        return list.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
      case "date-desc":
      default:
        return list.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    }
  }, [filteredBookmarks, sortField]);

  // Multi-selection handlers
  const handleToggleSelectBookmark = (id: string) => {
    setSelectedBookmarkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectFolder = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const allVisibleSelected =
    sortedBookmarks.length > 0 &&
    sortedBookmarks.every((b) => selectedBookmarkIds.has(b.id));

  const handleToggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedBookmarkIds(new Set());
    } else {
      setSelectedBookmarkIds(new Set(sortedBookmarks.map((b) => b.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedBookmarkIds(new Set());
    setSelectedFolderIds(new Set());
  };

  // Batch actions
  const handleDeleteSelected = async () => {
    const totalCount = selectedBookmarkIds.size + selectedFolderIds.size;
    if (
      !window.confirm(
        `Are you sure you want to permanently delete ${totalCount} selected item(s) from Chrome bookmarks?`
      )
    ) {
      return;
    }

    if (selectedBookmarkIds.size > 0) {
      await deleteMultipleBookmarks(Array.from(selectedBookmarkIds));
    }
    if (selectedFolderIds.size > 0) {
      await deleteMultipleFolders(Array.from(selectedFolderIds));
    }

    handleClearSelection();
    refreshData();
  };

  const handleMoveSelected = async (destinationFolderId: string) => {
    if (selectedBookmarkIds.size > 0) {
      await moveMultipleBookmarks(Array.from(selectedBookmarkIds), destinationFolderId);
    }
    if (selectedFolderIds.size > 0) {
      await moveMultipleFolders(Array.from(selectedFolderIds), destinationFolderId);
    }
    handleClearSelection();
    refreshData();
  };

  const handleCopySelected = async (destinationFolderId: string) => {
    const selectedList = allBookmarks.filter((b) => selectedBookmarkIds.has(b.id));
    if (selectedList.length > 0) {
      await copyMultipleBookmarks(selectedList, destinationFolderId);
    }
    handleClearSelection();
    refreshData();
  };

  // Refetch execution
  const executeRefetch = async (targets: EnhancedBookmark[]) => {
    if (targets.length === 0) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Reset progress completely so each run starts clean from 0
    setRefetchProgress({
      isRunning: true,
      total: targets.length,
      current: 0,
      currentTitle: "Starting refetch...",
      currentUrl: "",
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
    });
    setRefetchModalOpen(true);

    try {
      await runBatchRefetch(
        targets,
        {
          fetchScope: preferences.fetchScope,
          skip200OnRefetch: preferences.skip200OnRefetch,
          refetchErrorsOnly: preferences.refetchErrorsOnly,
          autoUpdateChromeBookmarkTitles: preferences.autoUpdateChromeBookmarkTitles,
          concurrency: preferences.concurrencyLimit,
        },
        (prog) => setRefetchProgress(prog),
        abortControllerRef.current.signal
      );
    } catch (err) {
      console.error("Batch refetch error", err);
    } finally {
      refreshData();
    }
  };

  const handleRefetchAll = () => {
    executeRefetch(allBookmarks);
  };

  const handleRefetchSelected = () => {
    const selected = allBookmarks.filter((b) => selectedBookmarkIds.has(b.id));
    executeRefetch(selected);
  };

  const handleRefetchSingle = async (b: EnhancedBookmark) => {
    if (!b.url) return;
    const res = await fetchLivePageDetails(b.url, preferences.fetchScope);
    const updates: any = {
      httpStatus: res.httpStatus,
      httpStatusText: res.httpStatusText,
      finalUrl: res.finalUrl,
      isRedirect: res.isRedirect,
      ogImage: res.ogImage || b.ogImage,
      favicon: res.favicon || b.favicon,
      description: res.description || b.description,
      readerContent: res.readerText || b.readerContent,
      tags: res.suggestedTags ? Array.from(new Set([...b.tags, ...res.suggestedTags])) : b.tags,
    };
    if (preferences.autoUpdateChromeBookmarkTitles && res.title) {
      updates.title = res.title;
    }
    await updateBookmark(b.id, updates);
    refreshData();
  };

  const handleCancelRefetch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setRefetchProgress({
      isRunning: false,
      total: 0,
      current: 0,
      currentTitle: "Stopped",
      currentUrl: "",
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
    });
    setRefetchModalOpen(false);
    refreshData();
  };

  // Batch tab screenshots execution
  const executeBatchScreenshots = async (
    targets: EnhancedBookmark[],
    options: { skipExisting: boolean; settleDelayMs: number }
  ) => {
    if (targets.length === 0) return;

    if (screenshotAbortControllerRef.current) {
      screenshotAbortControllerRef.current.abort();
    }
    screenshotAbortControllerRef.current = new AbortController();

    setScreenshotProgress({
      isRunning: true,
      total: targets.length,
      current: 0,
      currentTitle: "Initializing batch tab capture...",
      currentUrl: "",
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
    });
    setScreenshotModalOpen(true);

    try {
      await runBatchTabScreenshots(
        targets,
        {
          skipExisting: options.skipExisting,
          settleDelayMs: options.settleDelayMs,
          autoUpdateChromeBookmarkTitles: preferences.autoUpdateChromeBookmarkTitles,
        },
        (prog) => setScreenshotProgress(prog),
        screenshotAbortControllerRef.current.signal
      );
    } catch (err) {
      console.error("Batch screenshot error", err);
    } finally {
      screenshotAbortControllerRef.current = null;
      refreshData();
    }
  };

  const handleStartBatchScreenshotsFromSettings = (options: {
    skipExisting: boolean;
    settleDelayMs: number;
  }) => {
    executeBatchScreenshots(allBookmarks, options);
  };

  const handleCaptureSelectedScreenshots = () => {
    const selected = allBookmarks.filter((b) => selectedBookmarkIds.has(b.id));
    if (selected.length > 0) {
      executeBatchScreenshots(selected, { skipExisting: false, settleDelayMs: 1200 });
    }
  };

  const handleCancelBatchScreenshots = () => {
    if (screenshotAbortControllerRef.current) {
      screenshotAbortControllerRef.current.abort();
      screenshotAbortControllerRef.current = null;
    }
    setScreenshotProgress({
      isRunning: false,
      total: 0,
      current: 0,
      currentTitle: "Stopped",
      currentUrl: "",
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
    });
    setScreenshotModalOpen(false);
    refreshData();
  };

  // Individual bookmark actions
  const handleToggleFavorite = async (id: string, isFavorite: boolean) => {
    await updateBookmark(id, { isFavorite });
    refreshData();
  };

  const handleDeleteBookmark = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this bookmark?")) {
      await deleteBookmark(id);
      refreshData();
    }
  };

  const handleCaptureScreenshot = async (bookmark: EnhancedBookmark) => {
    if (!bookmark.url) return;
    await captureBookmarkUrlScreenshot(
      bookmark.url,
      bookmark.id,
      preferences.autoUpdateChromeBookmarkTitles
    );
    refreshData();
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim(), selectedFolderId || "1");
    setNewFolderName("");
    setNewFolderModalOpen(false);
    refreshData();
  };

  const starredCount = allBookmarks.filter((b) => b.isFavorite).length;
  const snapshotCount = allBookmarks.filter((b) => !!b.screenshot).length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary selection:text-primary-foreground">
      {/* Header */}
      <Header
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sortField={sortField}
        onSortFieldChange={setSortField}
        onOpenAddBookmark={() => {
          setEditingBookmark(null);
          setEditModalOpen(true);
        }}
        onOpenAddFolder={() => setNewFolderModalOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onRefetchAll={handleRefetchAll}
        onReloadVault={handleReloadVault}
        isReloading={isReloading}
        gitHubConfig={gitHubConfig}
        onGitHubConfigChange={refreshData}
        totalBookmarks={allBookmarks.length}
      />

      {/* Hero Banner */}
      <div className="border-b border-border bg-card/60 py-2.5 sm:py-4 px-3 sm:px-6 w-full">
        <div className="max-w-[1600px] w-full mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl md:text-2xl font-black uppercase tracking-tight">
              Personal <span className="marker-slanted">Bookmarks</span> Vault
            </h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
              Synchronized with Chrome bookmarks & backed up to GitHub.
            </p>
          </div>

          {/* Quick Search Bar (Title, Domain, HTTP code, Tags, Notes) */}
          <div className="w-full sm:w-72 md:w-80 lg:w-96 relative min-w-0">
            <Input
              id="global-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, domain, http code, tags (/)..."
              icon={<Search className="w-4 h-4 text-muted-foreground" />}
              className="py-1.5 sm:py-2 bg-background shadow-xs text-xs md:text-sm w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-4 md:p-6 pb-28 md:pb-6 flex flex-col md:flex-row gap-4 sm:gap-6 min-w-0">
        {/* Desktop Left Sidebar (Hidden on mobile < md) */}
        <div className="hidden md:block">
          <Sidebar
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            selectedFolderIds={selectedFolderIds}
            onToggleFolderSelect={handleToggleSelectFolder}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
            allTags={allTags}
            selectedDomain={selectedDomain}
            onSelectDomain={setSelectedDomain}
            allDomains={allDomains}
            httpCodeFilter={httpCodeFilter}
            onSelectHttpCodeFilter={setHttpCodeFilter}
            activeFilter={activeFilter}
            onSelectFilter={setActiveFilter}
            totalBookmarksCount={allBookmarks.length}
            starredCount={starredCount}
            snapshotCount={snapshotCount}
            statusCounts={statusCounts}
          />
        </div>

        {/* Bookmarks Display Area */}
        <main className="flex-1 min-w-0">
          {/* Active Filter Pill Strip (Scrollable on mobile) */}
          {(selectedFolderId || selectedTag || selectedDomain || httpCodeFilter || searchQuery || activeFilter !== "all") && (
            <div className="mb-4 sm:mb-6 flex items-center gap-1.5 sm:gap-2 p-2 sm:p-3 bg-muted/30 border border-border overflow-x-auto no-scrollbar">
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground flex-shrink-0">
                Filters:
              </span>

              {selectedFolderId && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] sm:text-xs font-bold bg-primary text-primary-foreground flex-shrink-0">
                  <Folder className="w-3 h-3" />
                  <span className="max-w-[120px] truncate">
                    {folders.find((f) => f.id === selectedFolderId)?.title || "Folder"}
                  </span>
                  <button onClick={() => setSelectedFolderId(null)} className="cursor-pointer font-black ml-0.5">×</button>
                </span>
              )}

              {selectedDomain && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] sm:text-xs font-mono font-bold bg-primary text-primary-foreground flex-shrink-0">
                  <Globe className="w-3 h-3" />
                  <span className="max-w-[120px] truncate">{selectedDomain}</span>
                  <button onClick={() => setSelectedDomain(null)} className="cursor-pointer font-black ml-0.5">×</button>
                </span>
              )}

              {httpCodeFilter && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] sm:text-xs font-bold uppercase flex-shrink-0 ${
                    httpCodeFilter === "healthy"
                      ? "bg-green-500 text-black"
                      : httpCodeFilter === "redirects"
                      ? "bg-amber-500 text-black"
                      : httpCodeFilter === "errors"
                      ? "bg-red-500 text-white"
                      : "bg-muted text-foreground border border-border"
                  }`}
                >
                  {httpCodeFilter === "healthy" && <ShieldCheck className="w-3.5 h-3.5" />}
                  {httpCodeFilter === "redirects" && <ArrowUpRight className="w-3.5 h-3.5" />}
                  {httpCodeFilter === "errors" && <ShieldAlert className="w-3.5 h-3.5" />}
                  {httpCodeFilter === "unfetched" && <HelpCircle className="w-3.5 h-3.5" />}
                  <span>{httpCodeFilter}</span>
                  <button onClick={() => setHttpCodeFilter(null)} className="cursor-pointer font-black ml-0.5">×</button>
                </span>
              )}

              {selectedTag && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] sm:text-xs font-mono font-bold bg-primary text-primary-foreground flex-shrink-0">
                  #{selectedTag}
                  <button onClick={() => setSelectedTag(null)} className="cursor-pointer font-black ml-0.5">×</button>
                </span>
              )}

              {activeFilter !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] sm:text-xs font-bold bg-secondary text-secondary-foreground flex-shrink-0">
                  View: {activeFilter}
                  <button onClick={() => setActiveFilter("all")} className="cursor-pointer font-black ml-0.5">×</button>
                </span>
              )}

              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] sm:text-xs font-bold bg-muted text-foreground border border-border flex-shrink-0">
                  Query: "{searchQuery}"
                  <button onClick={() => setSearchQuery("")} className="cursor-pointer font-black ml-0.5">×</button>
                </span>
              )}

              <button
                onClick={() => {
                  setSelectedFolderId(null);
                  setSelectedTag(null);
                  setSelectedDomain(null);
                  setHttpCodeFilter(null);
                  setActiveFilter("all");
                  setSearchQuery("");
                }}
                className="text-[11px] sm:text-xs text-primary hover:underline font-bold ml-auto pl-2 flex-shrink-0 cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Empty State */}
          {sortedBookmarks.length === 0 ? (
            <div className="p-12 border-2 border-dashed border-border text-center space-y-4 bg-card">
              <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto" />
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">
                  No Bookmarks Found
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery
                    ? `No bookmarks matching "${searchQuery}"`
                    : "No bookmarks match the current filters."}
                </p>
              </div>
              <Button
                variant="default"
                onClick={() => {
                  setEditingBookmark(null);
                  setEditModalOpen(true);
                }}
                className="gap-2 font-bold"
              >
                <Plus className="w-4 h-4" /> Add Bookmark
              </Button>
            </div>
          ) : viewMode === "list" ? (
            /* List / Table View */
            <div className="space-y-2">
              {sortedBookmarks.map((bookmark) => (
                <BookmarkListRow
                  key={bookmark.id}
                  bookmark={bookmark}
                  isSelected={selectedBookmarkIds.has(bookmark.id)}
                  onToggleSelect={handleToggleSelectBookmark}
                  onEdit={(b) => {
                    setEditingBookmark(b);
                    setEditModalOpen(true);
                  }}
                  onDelete={handleDeleteBookmark}
                  onToggleFavorite={handleToggleFavorite}
                  onOpenBrowse={(b) => {
                    setBrowsingBookmark(b);
                    setBrowseModalOpen(true);
                  }}
                  onSelectTag={setSelectedTag}
                  clickAction={preferences.clickAction}
                />
              ))}
            </div>
          ) : (
            /* Cards / Grid View */
            <div
              className={`grid gap-6 ${
                viewMode === "cards"
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              }`}
            >
              {sortedBookmarks.map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  viewMode={viewMode}
                  isSelected={selectedBookmarkIds.has(bookmark.id)}
                  onToggleSelect={handleToggleSelectBookmark}
                  onEdit={(b) => {
                    setEditingBookmark(b);
                    setEditModalOpen(true);
                  }}
                  onDelete={handleDeleteBookmark}
                  onToggleFavorite={handleToggleFavorite}
                  onOpenBrowse={(b) => {
                    setBrowsingBookmark(b);
                    setBrowseModalOpen(true);
                  }}
                  onCaptureScreenshot={handleCaptureScreenshot}
                  onSelectTag={setSelectedTag}
                  mainViewThumbnail={preferences.mainViewThumbnail}
                  clickAction={preferences.clickAction}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Multi-Select Batch Action Bar */}
      <BatchActionBar
        selectedBookmarkCount={selectedBookmarkIds.size}
        selectedFolderCount={selectedFolderIds.size}
        totalVisibleCount={sortedBookmarks.length}
        allSelected={allVisibleSelected}
        onToggleSelectAll={handleToggleSelectAll}
        onClearSelection={handleClearSelection}
        onDeleteSelected={handleDeleteSelected}
        onRefetchSelected={handleRefetchSelected}
        onCaptureSelectedScreenshots={handleCaptureSelectedScreenshots}
        onMoveSelected={handleMoveSelected}
        onCopySelected={handleCopySelected}
        folders={folders}
      />

      {/* Refetch Progress Modal */}
      <RefetchProgressModal
        isOpen={refetchModalOpen}
        onClose={() => setRefetchModalOpen(false)}
        progress={refetchProgress}
        onCancel={handleCancelRefetch}
      />

      {/* Batch Screenshot Progress Modal */}
      <ScreenshotProgressModal
        isOpen={screenshotModalOpen}
        onClose={() => setScreenshotModalOpen(false)}
        progress={screenshotProgress}
        onCancel={handleCancelBatchScreenshots}
      />

      {/* Edit Bookmark Modal */}
      <BookmarkEditModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        bookmark={editingBookmark}
        folders={folders}
        onSave={async (data) => {
          if (data.id) {
            await updateBookmark(data.id, data);
          } else {
            await createBookmark({
              parentId: data.parentId,
              title: data.title,
              url: data.url,
              tags: data.tags,
              description: data.description,
              notes: data.notes,
              screenshot: data.screenshot,
              isFavorite: data.isFavorite,
            });
          }
          refreshData();
        }}
      />

      {/* Browse Mode Modal (Expanded View) */}
      <BrowseModeModal
        isOpen={browseModalOpen}
        onClose={() => setBrowseModalOpen(false)}
        bookmark={browsingBookmark}
        onEdit={(b) => {
          setBrowseModalOpen(false);
          setEditingBookmark(b);
          setEditModalOpen(true);
        }}
        onRefetchSingle={handleRefetchSingle}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        config={gitHubConfig}
        onConfigUpdated={refreshData}
        totalBookmarks={allBookmarks.length}
        onLaunchBatchScreenshots={handleStartBatchScreenshotsFromSettings}
      />

      {/* New Folder Modal */}
      <Modal
        isOpen={newFolderModalOpen}
        onClose={() => setNewFolderModalOpen(false)}
        title="Create Bookmark Folder"
        subtitle="Adds a native folder inside Chrome bookmarks"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateFolder} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Folder Name *
            </label>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Design Inspiration"
              required
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setNewFolderModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="default" className="font-bold">
              Create Folder
            </Button>
          </div>
        </form>
      </Modal>

      {/* Mobile Filter & Folders Drawer Modal */}
      <Modal
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        title="Folders & Filters"
        subtitle={`${filteredBookmarks.length} of ${allBookmarks.length} bookmarks matching`}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <Sidebar
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            selectedFolderIds={selectedFolderIds}
            onToggleFolderSelect={handleToggleSelectFolder}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
            allTags={allTags}
            selectedDomain={selectedDomain}
            onSelectDomain={setSelectedDomain}
            allDomains={allDomains}
            httpCodeFilter={httpCodeFilter}
            onSelectHttpCodeFilter={setHttpCodeFilter}
            activeFilter={activeFilter}
            onSelectFilter={setActiveFilter}
            totalBookmarksCount={allBookmarks.length}
            starredCount={starredCount}
            snapshotCount={snapshotCount}
            statusCounts={statusCounts}
          />
          <div className="sticky bottom-0 bg-card pt-3 border-t border-border flex items-center gap-2">
            {(selectedFolderId || selectedTag || selectedDomain || httpCodeFilter) && (
              <Button
                variant="outline"
                className="font-bold uppercase tracking-wider text-xs"
                onClick={() => {
                  setSelectedFolderId(null);
                  setSelectedTag(null);
                  setSelectedDomain(null);
                  setHttpCodeFilter(null);
                  setActiveFilter("all");
                }}
              >
                Reset
              </Button>
            )}
            <Button
              variant="default"
              className="flex-1 font-bold uppercase tracking-wider text-xs"
              onClick={() => setMobileDrawerOpen(false)}
            >
              Show ({filteredBookmarks.length}) Bookmarks
            </Button>
          </div>
        </div>
      </Modal>

      {/* Mobile Bottom Navigation Bar (Hidden on desktop md+) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-md border-t-2 border-border px-1 py-1 flex items-center justify-around shadow-2xl safe-area-bottom select-none">
        {/* Vault / All */}
        <button
          onClick={() => {
            setSelectedFolderId(null);
            setSelectedTag(null);
            setSelectedDomain(null);
            setHttpCodeFilter(null);
            setActiveFilter("all");
            setSearchQuery("");
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[10px] font-bold uppercase transition-colors cursor-pointer min-h-[44px] ${
            activeFilter === "all" && !selectedFolderId && !selectedTag && !selectedDomain && !httpCodeFilter && !searchQuery
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="w-4 h-4 mb-0.5" />
          <span>Vault</span>
        </button>

        {/* Starred */}
        <button
          onClick={() => {
            setActiveFilter(activeFilter === "starred" ? "all" : "starred");
            setSelectedFolderId(null);
            setSelectedTag(null);
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[10px] font-bold uppercase transition-colors cursor-pointer min-h-[44px] ${
            activeFilter === "starred"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Star className={`w-4 h-4 mb-0.5 ${activeFilter === "starred" ? "text-amber-400 fill-amber-400" : ""}`} />
          <span>Starred</span>
        </button>

        {/* Center Quick Add Button */}
        <div className="flex-1 flex justify-center">
          <button
            onClick={() => {
              setEditingBookmark(null);
              setEditModalOpen(true);
            }}
            className="flex flex-col items-center justify-center px-4 py-2 -mt-4 bg-primary text-primary-foreground border-2 border-border shadow-lg active:translate-y-0.5 cursor-pointer font-black"
            title="Add New Bookmark"
          >
            <Plus className="w-5 h-5" />
            <span className="text-[9px] uppercase tracking-wider">Add</span>
          </button>
        </div>

        {/* Filters & Folders Drawer Button */}
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className={`flex-1 relative flex flex-col items-center justify-center py-1.5 px-1 text-[10px] font-bold uppercase transition-colors cursor-pointer min-h-[44px] ${
            selectedFolderId || selectedTag || selectedDomain || httpCodeFilter
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Folder className="w-4 h-4 mb-0.5" />
          <span>Filters</span>
          {(selectedFolderId || selectedTag || selectedDomain || httpCodeFilter) && (
            <span className="absolute top-1 right-1/4 w-2 h-2 bg-primary ring-2 ring-card" />
          )}
        </button>

        {/* Settings Button */}
        <button
          onClick={() => setSettingsModalOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground cursor-pointer min-h-[44px]"
        >
          <Settings className="w-4 h-4 mb-0.5" />
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}

