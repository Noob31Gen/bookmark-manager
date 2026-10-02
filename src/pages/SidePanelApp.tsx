import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Star,
  ExternalLink,
  Layers,
  Maximize2,
  Folder,
  Tag,
  Copy,
  Check,
  Camera,
  Trash2,
} from "lucide-react";
import { EnhancedBookmark, FolderNode } from "../lib/types";
import {
  getEnhancedBookmarkTree,
  extractAllBookmarks,
  extractFolderTree,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  subscribeToBookmarkChanges,
} from "../lib/chromeBookmarks";
import { extractActiveTabDetails, captureActiveTabScreenshot } from "../lib/capture";
import { getDomain, getFaviconUrl } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ThemeToggle } from "../components/layout/ThemeToggle";

export function SidePanelApp() {
  const [tree, setTree] = useState<EnhancedBookmark[]>([]);
  const [search, setSearch] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refreshData = async () => {
    const data = await getEnhancedBookmarkTree();
    setTree(data);
  };

  useEffect(() => {
    refreshData();
    const unsub = subscribeToBookmarkChanges(() => refreshData());
    return () => unsub();
  }, []);

  const allBookmarks = useMemo(() => extractAllBookmarks(tree), [tree]);
  const folders = useMemo(() => extractFolderTree(tree), [tree]);

  const filteredBookmarks = useMemo(() => {
    return allBookmarks.filter((b) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          b.title.toLowerCase().includes(q) ||
          b.url?.toLowerCase().includes(q) ||
          b.tags.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (selectedFolderId && b.parentId !== selectedFolderId) return false;
      if (selectedTag && !b.tags.includes(selectedTag)) return false;
      if (filterStarredOnly && !b.isFavorite) return false;
      return true;
    });
  }, [allBookmarks, search, selectedFolderId, selectedTag, filterStarredOnly]);

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
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
          <button
            onClick={() => {
              setFilterStarredOnly(!filterStarredOnly);
            }}
            className={`px-2 py-0.5 font-bold uppercase border text-[10px] flex items-center gap-1 transition-all ${
              filterStarredOnly
                ? "bg-amber-400 text-black border-amber-400"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            <Star className="w-3 h-3 fill-current" /> Starred
          </button>

          {selectedFolderId && (
            <button
              onClick={() => setSelectedFolderId(null)}
              className="px-2 py-0.5 font-bold uppercase border text-[10px] bg-primary text-primary-foreground border-primary flex items-center gap-1"
            >
              Folder Filter ×
            </button>
          )}

          {selectedTag && (
            <button
              onClick={() => setSelectedTag(null)}
              className="px-2 py-0.5 font-mono font-bold uppercase border text-[10px] bg-primary text-primary-foreground border-primary flex items-center gap-1"
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
          filteredBookmarks.map((b) => (
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
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-xs text-foreground hover:text-primary transition-colors line-clamp-1"
                    title={b.title}
                  >
                    {b.title}
                  </a>
                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {getDomain(b.url)}
                  </span>

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
          ))
        )}
      </div>
    </div>
  );
}
