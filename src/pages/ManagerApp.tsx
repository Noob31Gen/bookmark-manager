import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Sparkles,
  FolderPlus,
  AlertCircle,
  Hash,
  Folder,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { EnhancedBookmark, FolderNode, GitHubConfig, ViewMode } from "../lib/types";
import {
  getEnhancedBookmarkTree,
  extractAllBookmarks,
  extractFolderTree,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  createFolder,
  subscribeToBookmarkChanges,
} from "../lib/chromeBookmarks";
import { getGitHubConfig, DEFAULT_GITHUB_CONFIG } from "../lib/metadataStore";
import { captureActiveTabScreenshot } from "../lib/capture";
import { Header } from "../components/layout/Header";
import { Sidebar } from "../components/layout/Sidebar";
import { BookmarkCard } from "../components/BookmarkCard";
import { BookmarkListRow } from "../components/BookmarkListRow";
import { BookmarkEditModal } from "../components/BookmarkEditModal";
import { ReaderModal } from "../components/ReaderModal";
import { SettingsModal } from "../components/SettingsModal";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";

export function ManagerApp() {
  const [tree, setTree] = useState<EnhancedBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<
    "all" | "starred" | "recent" | "snapshots" | "untagged"
  >("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [gitHubConfig, setGitHubConfig] = useState<GitHubConfig>(DEFAULT_GITHUB_CONFIG);

  // Modals state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<EnhancedBookmark | null>(null);
  const [readerModalOpen, setReaderModalOpen] = useState(false);
  const [readingBookmark, setReadingBookmark] = useState<EnhancedBookmark | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const refreshData = async () => {
    try {
      const data = await getEnhancedBookmarkTree();
      setTree(data);
      const gh = await getGitHubConfig();
      setGitHubConfig(gh);
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

  // Global search keyboard shortcut ('/' or 'Ctrl+K')
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "/" || (e.ctrlKey && e.key === "k")) && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("global-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const allBookmarks = useMemo(() => extractAllBookmarks(tree), [tree]);
  const folders = useMemo(() => extractFolderTree(tree), [tree]);

  // Aggregate all unique tags with count
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

  // Filter bookmarks based on folder, tags, search, and active tab filter
  const filteredBookmarks = useMemo(() => {
    return allBookmarks.filter((b) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = b.title.toLowerCase().includes(q);
        const matchesUrl = b.url?.toLowerCase().includes(q);
        const matchesDesc = b.description?.toLowerCase().includes(q);
        const matchesNotes = b.notes?.toLowerCase().includes(q);
        const matchesTags = b.tags?.some((t) => t.toLowerCase().includes(q));

        if (!matchesTitle && !matchesUrl && !matchesDesc && !matchesNotes && !matchesTags) {
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

      // Quick filter
      if (activeFilter === "starred" && !b.isFavorite) return false;
      if (activeFilter === "snapshots" && !b.screenshot) return false;
      if (activeFilter === "untagged" && b.tags && b.tags.length > 0) return false;

      return true;
    });
  }, [allBookmarks, searchQuery, selectedFolderId, selectedTag, activeFilter]);

  // Bookmark handlers
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
        onOpenAddBookmark={() => {
          setEditingBookmark(null);
          setEditModalOpen(true);
        }}
        onOpenAddFolder={() => setNewFolderModalOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        gitHubConfig={gitHubConfig}
        onGitHubConfigChange={refreshData}
        totalBookmarks={allBookmarks.length}
      />

      {/* Hero Banner with Noob31 Slanted Marker Aesthetic */}
      <div className="border-b border-border bg-card/60 py-8 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight">
              Personal <span className="marker-slanted">Bookmarks</span> Vault
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">
              Synchronized with native Chrome bookmarks & backed up to GitHub Cloud storage.
            </p>
          </div>

          {/* Quick Search Bar */}
          <div className="w-full md:w-80 relative">
            <Input
              id="global-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bookmarks (/)..."
              icon={<Search className="w-4 h-4 text-muted-foreground" />}
              className="py-2.5 bg-background shadow-xs text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 flex flex-col md:flex-row gap-8">
        {/* Left Sidebar */}
        <Sidebar
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
          allTags={allTags}
          activeFilter={activeFilter}
          onSelectFilter={setActiveFilter}
          totalBookmarksCount={allBookmarks.length}
          starredCount={starredCount}
          snapshotCount={snapshotCount}
        />

        {/* Bookmarks Display Area */}
        <main className="flex-1 min-w-0">
          {/* Active Filter Pill Strip */}
          {(selectedFolderId || selectedTag || searchQuery || activeFilter !== "all") && (
            <div className="mb-6 flex flex-wrap items-center gap-2 p-3 bg-muted/30 border border-border">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Active Filters:
              </span>

              {selectedFolderId && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-primary text-primary-foreground">
                  <Folder className="w-3 h-3" />
                  {folders.find((f) => f.id === selectedFolderId)?.title || "Folder"}
                  <button onClick={() => setSelectedFolderId(null)}>×</button>
                </span>
              )}

              {selectedTag && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-bold bg-primary text-primary-foreground">
                  #{selectedTag}
                  <button onClick={() => setSelectedTag(null)}>×</button>
                </span>
              )}

              {activeFilter !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-secondary text-secondary-foreground">
                  Filter: {activeFilter}
                  <button onClick={() => setActiveFilter("all")}>×</button>
                </span>
              )}

              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-muted text-foreground border border-border">
                  Query: "{searchQuery}"
                  <button onClick={() => setSearchQuery("")}>×</button>
                </span>
              )}

              <button
                onClick={() => {
                  setSelectedFolderId(null);
                  setSelectedTag(null);
                  setActiveFilter("all");
                  setSearchQuery("");
                }}
                className="text-xs text-primary hover:underline font-bold ml-auto"
              >
                Reset all
              </button>
            </div>
          )}

          {/* Empty State */}
          {filteredBookmarks.length === 0 ? (
            <div className="p-12 border-2 border-dashed border-border text-center space-y-4 bg-card">
              <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto" />
              <div>
                <h3 className="text-lg font-bold text-foreground uppercase tracking-wide">
                  No Bookmarks Found
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery
                    ? `No bookmarks matching "${searchQuery}"`
                    : "Your vault is ready. Add your first bookmark or import existing ones."}
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
              {filteredBookmarks.map((bookmark) => (
                <BookmarkListRow
                  key={bookmark.id}
                  bookmark={bookmark}
                  onEdit={(b) => {
                    setEditingBookmark(b);
                    setEditModalOpen(true);
                  }}
                  onDelete={handleDeleteBookmark}
                  onToggleFavorite={handleToggleFavorite}
                  onOpenReader={(b) => {
                    setReadingBookmark(b);
                    setReaderModalOpen(true);
                  }}
                  onSelectTag={setSelectedTag}
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
              {filteredBookmarks.map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  viewMode={viewMode}
                  onEdit={(b) => {
                    setEditingBookmark(b);
                    setEditModalOpen(true);
                  }}
                  onDelete={handleDeleteBookmark}
                  onToggleFavorite={handleToggleFavorite}
                  onOpenReader={(b) => {
                    setReadingBookmark(b);
                    setReaderModalOpen(true);
                  }}
                  onCaptureScreenshot={handleCaptureScreenshot}
                  onSelectTag={setSelectedTag}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
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

      <ReaderModal
        isOpen={readerModalOpen}
        onClose={() => setReaderModalOpen(false)}
        bookmark={readingBookmark}
      />

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
