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
import { captureActiveTabScreenshot } from "../lib/capture";
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

  // Modals state
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
    await updateBookmark(b.id, {
      httpStatus: res.httpStatus,
      httpStatusText: res.httpStatusText,
      finalUrl: res.finalUrl,
      isRedirect: res.isRedirect,
      ogImage: res.ogImage || b.ogImage,
      favicon: res.favicon || b.favicon,
      description: res.description || b.description,
      readerContent: res.readerText || b.readerContent,
      tags: res.suggestedTags ? Array.from(new Set([...b.tags, ...res.suggestedTags])) : b.tags,
    });
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
    const screenshot = await captureActiveTabScreenshot();
    if (screenshot) {
      await updateBookmark(bookmark.id, { screenshot });
      refreshData();
    }
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
        gitHubConfig={gitHubConfig}
        onGitHubConfigChange={refreshData}
        totalBookmarks={allBookmarks.length}
      />

      {/* Hero Banner */}
      <div className="border-b border-border bg-card/60 py-6 px-4 md:px-6">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight">
              Personal <span className="marker-slanted">Bookmarks</span> Vault
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              Synchronized with native Chrome bookmarks & backed up to GitHub Cloud storage.
            </p>
          </div>

          {/* Quick Search Bar (Title, Domain, HTTP code, Tags, Notes) */}
          <div className="w-full md:w-96 relative">
            <Input
              id="global-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, domain, http code (404/200), tags (/)..."
              icon={<Search className="w-4 h-4 text-muted-foreground" />}
              className="py-2 bg-background shadow-xs text-xs md:text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-6 flex flex-col md:flex-row gap-6">
        {/* Left Sidebar */}
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

        {/* Bookmarks Display Area */}
        <main className="flex-1 min-w-0">
          {/* Active Filter Pill Strip */}
          {(selectedFolderId || selectedTag || selectedDomain || httpCodeFilter || searchQuery || activeFilter !== "all") && (
            <div className="mb-6 flex flex-wrap items-center gap-2 p-3 bg-muted/30 border border-border">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Active Filters:
              </span>

              {selectedFolderId && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-primary text-primary-foreground">
                  <Folder className="w-3 h-3" />
                  {folders.find((f) => f.id === selectedFolderId)?.title || "Folder"}
                  <button onClick={() => setSelectedFolderId(null)} className="cursor-pointer">×</button>
                </span>
              )}

              {selectedDomain && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-bold bg-primary text-primary-foreground">
                  <Globe className="w-3 h-3" />
                  {selectedDomain}
                  <button onClick={() => setSelectedDomain(null)} className="cursor-pointer">×</button>
                </span>
              )}

              {httpCodeFilter && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-bold uppercase ${
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
                  Status: {httpCodeFilter}
                  <button onClick={() => setHttpCodeFilter(null)} className="cursor-pointer">×</button>
                </span>
              )}

              {selectedTag && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-bold bg-primary text-primary-foreground">
                  #{selectedTag}
                  <button onClick={() => setSelectedTag(null)} className="cursor-pointer">×</button>
                </span>
              )}

              {activeFilter !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-secondary text-secondary-foreground">
                  View: {activeFilter}
                  <button onClick={() => setActiveFilter("all")} className="cursor-pointer">×</button>
                </span>
              )}

              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-muted text-foreground border border-border">
                  Query: "{searchQuery}"
                  <button onClick={() => setSearchQuery("")} className="cursor-pointer">×</button>
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
                className="text-xs text-primary hover:underline font-bold ml-auto cursor-pointer"
              >
                Reset all
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
    </div>
  );
}
