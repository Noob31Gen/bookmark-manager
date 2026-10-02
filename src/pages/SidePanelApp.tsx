import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Star,
  ExternalLink,
  Maximize2,
  Copy,
  Check,
  Compass,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  RotateCw,
} from "lucide-react";
import { EnhancedBookmark, FolderNode } from "../lib/types";
import {
  getEnhancedBookmarkTree,
  extractAllBookmarks,
  extractFolderTree,
  createBookmark,
  updateBookmark,
  subscribeToBookmarkChanges,
} from "../lib/chromeBookmarks";
import { extractActiveTabDetails, captureActiveTabScreenshot } from "../lib/capture";
import { fetchLivePageDetails } from "../lib/fetcher";
import { getDomain, getFaviconUrl } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ThemeToggle } from "../components/layout/ThemeToggle";
import { BrowseModeModal } from "../components/BrowseModeModal";
import { BookmarkEditModal } from "../components/BookmarkEditModal";

export function SidePanelApp() {
  const [tree, setTree] = useState<EnhancedBookmark[]>([]);
  const [search, setSearch] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [httpStatusFilter, setHttpStatusFilter] = useState<
    "healthy" | "redirects" | "errors" | "unfetched" | null
  >(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Browse mode & Edit modal state
  const [browseModalOpen, setBrowseModalOpen] = useState(false);
  const [browsingBookmark, setBrowsingBookmark] = useState<EnhancedBookmark | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<EnhancedBookmark | null>(null);

  const refreshData = async () => {
    const data = await getEnhancedBookmarkTree();
    setTree(data);
    if (browsingBookmark) {
      const flat = extractAllBookmarks(data);
      const updated = flat.find((b) => b.id === browsingBookmark.id);
      if (updated) setBrowsingBookmark(updated);
    }
  };

  const handleReloadVault = async () => {
    setIsReloading(true);
    await refreshData();
    setTimeout(() => {
      setIsReloading(false);
    }, 400);
  };

  useEffect(() => {
    refreshData();
    const unsub = subscribeToBookmarkChanges(() => refreshData());
    return () => unsub();
  }, []);

  const allBookmarks = useMemo(() => extractAllBookmarks(tree), [tree]);
  const folders = useMemo(() => extractFolderTree(tree), [tree]);

  // Compute status breakdown counts
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

  const filteredBookmarks = useMemo(() => {
    return allBookmarks.filter((b) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          b.title.toLowerCase().includes(q) ||
          b.url?.toLowerCase().includes(q) ||
          (b.httpStatus && String(b.httpStatus).includes(q)) ||
          b.tags.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (selectedFolderId && b.parentId !== selectedFolderId) return false;
      if (selectedTag && !b.tags.includes(selectedTag)) return false;
      if (filterStarredOnly && !b.isFavorite) return false;

      // HTTP status filters
      if (httpStatusFilter) {
        const isRedirect =
          b.isRedirect ||
          (b.httpStatus !== undefined && b.httpStatus >= 300 && b.httpStatus < 400) ||
          (!!b.finalUrl && b.finalUrl !== b.url);

        if (httpStatusFilter === "healthy") {
          if (b.httpStatus === undefined || b.httpStatus < 200 || b.httpStatus >= 300 || isRedirect) {
            return false;
          }
        } else if (httpStatusFilter === "redirects") {
          if (!isRedirect) return false;
        } else if (httpStatusFilter === "errors") {
          if (b.httpStatus === undefined || (b.httpStatus >= 200 && b.httpStatus < 400 && !isRedirect)) {
            return false;
          }
        } else if (httpStatusFilter === "unfetched") {
          if (b.httpStatus !== undefined && b.httpStatus !== null) {
            return false;
          }
        }
      }

      return true;
    });
  }, [allBookmarks, search, selectedFolderId, selectedTag, filterStarredOnly, httpStatusFilter]);

  const handleQuickSaveActiveTab = async () => {
    setQuickSaving(true);
    try {
      const tabData = await extractActiveTabDetails();
      const screenshot = await captureActiveTabScreenshot();
      if (tabData && tabData.url) {
        await createBookmark({
          title: tabData.title,
          url: tabData.url,
          tags: tabData.suggestedTags,
          description: tabData.description,
          screenshot,
          favicon: tabData.favicon,
        });
        refreshData();
      }
    } catch (err) {
      console.error("Quick save failed", err);
    } finally {
      setQuickSaving(false);
    }
  };

  const handleCopy = (b: EnhancedBookmark) => {
    if (b.url) {
      navigator.clipboard.writeText(b.url);
      setCopiedId(b.id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  const handleOpenManager = () => {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
    } else {
      window.open("/manager.html", "_blank");
    }
  };

  const handleRefetchSingle = async (b: EnhancedBookmark) => {
    if (!b.url) return;
    const res = await fetchLivePageDetails(b.url, "all");
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

  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans select-none overflow-hidden">
      {/* Top Header */}
      <header className="p-3 border-b border-border bg-card flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="size-6 bg-primary flex items-center justify-center text-primary-foreground font-black text-xs border border-primary">
            N31
          </div>
          <span className="font-extrabold uppercase text-xs tracking-wider">
            <span className="marker-slanted">Vault</span> Sidepanel
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-xs"
            onClick={handleReloadVault}
            disabled={isReloading}
            title="Reload bookmarks and assets from Chrome storage"
          >
            <RotateCw className={`w-3 h-3 ${isReloading ? "animate-spin text-primary" : ""}`} />
          </Button>
          <ThemeToggle />
          <Button
            variant="outline"
            size="icon-xs"
            onClick={handleOpenManager}
            title="Expand Full Manager"
          >
            <Maximize2 className="w-3 h-3" />
          </Button>
        </div>
      </header>

      {/* Quick Actions & Search */}
      <div className="p-3 border-b border-border bg-muted/20 space-y-2">
        <Button
          variant="default"
          size="sm"
          onClick={handleQuickSaveActiveTab}
          disabled={quickSaving}
          className="w-full gap-1.5 font-bold text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{quickSaving ? "Capturing Tab..." : "Bookmark Current Tab"}</span>
        </Button>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search bookmarks..."
          icon={<Search className="w-3.5 h-3.5" />}
          className="text-xs py-1.5"
        />

        {/* Filters Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 text-xs">
          <button
            onClick={() => {
              setFilterStarredOnly(!filterStarredOnly);
            }}
            className={`px-2 py-0.5 font-bold uppercase border text-[10px] flex items-center gap-1 transition-all cursor-pointer flex-shrink-0 ${
              filterStarredOnly
                ? "bg-amber-400 text-black border-amber-400"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            <Star className="w-3 h-3 fill-current" /> Starred
          </button>

          {/* Healthy (200 OK) */}
          <button
            onClick={() => setHttpStatusFilter(httpStatusFilter === "healthy" ? null : "healthy")}
            className={`px-2 py-0.5 font-bold uppercase border text-[10px] flex items-center gap-1 transition-all cursor-pointer flex-shrink-0 ${
              httpStatusFilter === "healthy"
                ? "bg-green-500 text-black border-green-500 font-extrabold"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
            title="Healthy (200 OK)"
          >
            <ShieldCheck className="w-3 h-3 text-green-500" />
            <span>200</span>
            <span className="opacity-70 text-[9px]">({statusCounts.healthy})</span>
          </button>

          {/* Redirects (3xx) */}
          <button
            onClick={() => setHttpStatusFilter(httpStatusFilter === "redirects" ? null : "redirects")}
            className={`px-2 py-0.5 font-bold uppercase border text-[10px] flex items-center gap-1 transition-all cursor-pointer flex-shrink-0 ${
              httpStatusFilter === "redirects"
                ? "bg-amber-500 text-black border-amber-500 font-extrabold"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
            title="Redirects (3xx)"
          >
            <ArrowUpRight className="w-3 h-3 text-amber-500" />
            <span>3xx</span>
            <span className="opacity-70 text-[9px]">({statusCounts.redirects})</span>
          </button>

          {/* Errors (4xx/5xx) */}
          <button
            onClick={() => setHttpStatusFilter(httpStatusFilter === "errors" ? null : "errors")}
            className={`px-2 py-0.5 font-bold uppercase border text-[10px] flex items-center gap-1 transition-all cursor-pointer flex-shrink-0 ${
              httpStatusFilter === "errors"
                ? "bg-red-500 text-white border-red-500 font-extrabold"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
            title="Errors (4xx / 5xx)"
          >
            <ShieldAlert className="w-3 h-3 text-red-500" />
            <span>Errors</span>
            <span className="opacity-70 text-[9px]">({statusCounts.errors})</span>
          </button>

          {/* Unfetched */}
          <button
            onClick={() => setHttpStatusFilter(httpStatusFilter === "unfetched" ? null : "unfetched")}
            className={`px-2 py-0.5 font-bold uppercase border text-[10px] flex items-center gap-1 transition-all cursor-pointer flex-shrink-0 ${
              httpStatusFilter === "unfetched"
                ? "bg-muted text-foreground border-primary font-extrabold"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
            title="Unfetched bookmarks"
          >
            <HelpCircle className="w-3 h-3 text-muted-foreground" />
            <span>Unchecked</span>
            <span className="opacity-70 text-[9px]">({statusCounts.unfetched})</span>
          </button>

          {selectedFolderId && (
            <button
              onClick={() => setSelectedFolderId(null)}
              className="px-2 py-0.5 font-bold uppercase border text-[10px] bg-primary text-primary-foreground border-primary flex items-center gap-1 cursor-pointer flex-shrink-0"
            >
              Folder ×
            </button>
          )}

          {selectedTag && (
            <button
              onClick={() => setSelectedTag(null)}
              className="px-2 py-0.5 font-mono font-bold uppercase border text-[10px] bg-primary text-primary-foreground border-primary flex items-center gap-1 cursor-pointer flex-shrink-0"
            >
              #{selectedTag} ×
            </button>
          )}
        </div>
      </div>

      {/* Bookmarks List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredBookmarks.length === 0 ? (
          <div className="text-center py-10 text-xs text-muted-foreground">
            No bookmarks found
          </div>
        ) : (
          filteredBookmarks.map((b) => {
            const isRedirected = b.isRedirect || (!!b.finalUrl && b.finalUrl !== b.url);
            return (
              <div
                key={b.id}
                className="pop-3d group p-2.5 bg-card border border-border flex items-start justify-between gap-2"
              >
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <img
                    src={b.favicon || getFaviconUrl(b.url)}
                    alt=""
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                    className="w-3.5 h-3.5 mt-0.5 object-contain flex-shrink-0"
                  />

                  <div className="flex flex-col min-w-0 flex-1">
                    <div
                      onClick={() => {
                        setBrowsingBookmark(b);
                        setBrowseModalOpen(true);
                      }}
                      className="font-bold text-xs text-foreground hover:text-primary transition-colors line-clamp-1 cursor-pointer"
                      title={b.title}
                    >
                      {b.title}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                      <span className="truncate">{getDomain(b.url)}</span>
                      {isRedirected && (
                        <span className="text-amber-500 font-bold flex items-center gap-0.5">
                          <ArrowUpRight className="w-2.5 h-2.5" />
                          <span>3xx</span>
                        </span>
                      )}
                    </div>

                    {b.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {b.tags.slice(0, 2).map((t) => (
                          <span
                            key={t}
                            onClick={() => setSelectedTag(t)}
                            className="text-[9px] font-mono bg-muted/60 px-1 py-0.2 border border-border cursor-pointer hover:text-primary"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 flex-shrink-0">
                  {/* Browse Mode */}
                  <button
                    onClick={() => {
                      setBrowsingBookmark(b);
                      setBrowseModalOpen(true);
                    }}
                    className="p-1 hover:text-primary text-muted-foreground"
                    title="Open Browse Mode"
                  >
                    <Compass className="w-3 h-3 text-primary" />
                  </button>

                  <button
                    onClick={() => updateBookmark(b.id, { isFavorite: !b.isFavorite }).then(refreshData)}
                    className="p-1 text-muted-foreground hover:text-amber-400"
                  >
                    <Star
                      className={`w-3 h-3 ${
                        b.isFavorite ? "text-amber-400 fill-amber-400" : ""
                      }`}
                    />
                  </button>

                  <button
                    onClick={() => handleCopy(b)}
                    className="p-1 text-muted-foreground hover:text-primary"
                    title="Copy Link"
                  >
                    {copiedId === b.id ? (
                      <Check className="w-3 h-3 text-green-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>

                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-muted-foreground hover:text-primary"
                    title="Open Link"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Browse Mode Modal */}
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

      {/* Edit Modal */}
      <BookmarkEditModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        bookmark={editingBookmark}
        folders={folders}
        onSave={async (data) => {
          if (data.id) {
            await updateBookmark(data.id, data);
          }
          refreshData();
        }}
      />
    </div>
  );
}
