import { useState } from "react";
import {
  Folder,
  FolderOpen,
  Star,
  Clock,
  Image,
  Tag,
  Hash,
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles,
} from "lucide-react";
import { FolderNode } from "../../lib/types";
import { Badge } from "../ui/Badge";

interface SidebarProps {
  folders: FolderNode[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  allTags: { tag: string; count: number }[];
  activeFilter: "all" | "starred" | "recent" | "snapshots" | "untagged";
  onSelectFilter: (filter: "all" | "starred" | "recent" | "snapshots" | "untagged") => void;
  totalBookmarksCount: number;
  starredCount: number;
  snapshotCount: number;
}

export function Sidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  selectedTag,
  onSelectTag,
  allTags,
  activeFilter,
  onSelectFilter,
  totalBookmarksCount,
  starredCount,
  snapshotCount,
}: SidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    "1": true,
    "2": true,
  });

  const toggleFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderFolderItem = (folder: FolderNode, depth = 0) => {
    const isSelected = selectedFolderId === folder.id;
    const isExpanded = expandedFolders[folder.id] ?? true;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id} className="flex flex-col">
        <div
          onClick={() => {
            onSelectFilter("all");
            onSelectTag(null);
            onSelectFolder(isSelected ? null : folder.id);
          }}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`group flex items-center justify-between pr-2.5 py-1.5 cursor-pointer text-xs font-semibold uppercase tracking-wide border-l-2 transition-all ${
            isSelected
              ? "bg-primary/10 border-primary text-primary font-bold"
              : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            {hasChildren ? (
              <button
                onClick={(e) => toggleFolder(folder.id, e)}
                className="p-0.5 hover:text-foreground text-muted-foreground"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
            ) : (
              <span className="w-3" />
            )}

            {isSelected ? (
              <FolderOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground flex-shrink-0" />
            )}
            <span className="truncate">{folder.title}</span>
          </div>

          <span className="text-[10px] font-mono text-muted-foreground/80 px-1 bg-muted/50 border border-border/40">
            {folder.bookmarkCount}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="flex flex-col">
            {folder.children!.map((child) => renderFolderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-full md:w-64 lg:w-72 flex-shrink-0 flex flex-col gap-6 select-none">
      {/* Quick Filters */}
      <div className="flex flex-col border border-border bg-card p-3">
        <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-2 px-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Library Views
        </h4>

        <div className="space-y-0.5">
          <button
            onClick={() => {
              onSelectFilter("all");
              onSelectFolder(null);
              onSelectTag(null);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase transition-all ${
              activeFilter === "all" && !selectedFolderId && !selectedTag
                ? "bg-primary text-primary-foreground border border-primary shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>All Bookmarks</span>
            </div>
            <span className="font-mono text-[11px]">{totalBookmarksCount}</span>
          </button>

          <button
            onClick={() => {
              onSelectFilter("starred");
              onSelectFolder(null);
              onSelectTag(null);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase transition-all ${
              activeFilter === "starred"
                ? "bg-primary text-primary-foreground border border-primary shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>Starred</span>
            </div>
            <span className="font-mono text-[11px]">{starredCount}</span>
          </button>

          <button
            onClick={() => {
              onSelectFilter("snapshots");
              onSelectFolder(null);
              onSelectTag(null);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase transition-all ${
              activeFilter === "snapshots"
                ? "bg-primary text-primary-foreground border border-primary shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Image className="w-3.5 h-3.5 text-primary" />
              <span>With Snapshots</span>
            </div>
            <span className="font-mono text-[11px]">{snapshotCount}</span>
          </button>

          <button
            onClick={() => {
              onSelectFilter("recent");
              onSelectFolder(null);
              onSelectTag(null);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase transition-all ${
              activeFilter === "recent"
                ? "bg-primary text-primary-foreground border border-primary shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Recently Added</span>
            </div>
          </button>
        </div>
      </div>

      {/* Chrome Native Bookmark Folders */}
      <div className="flex flex-col border border-border bg-card p-3 max-h-[340px] overflow-y-auto">
        <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-2 px-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5" /> Chrome Folders
          </span>
          {selectedFolderId && (
            <button
              onClick={() => onSelectFolder(null)}
              className="text-[10px] text-primary hover:underline font-bold lowercase"
            >
              clear
            </button>
          )}
        </h4>

        <div className="space-y-0.5">
          {folders.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1">No folders found</p>
          ) : (
            folders.map((f) => renderFolderItem(f))
          )}
        </div>
      </div>

      {/* Tags Cloud */}
      <div className="flex flex-col border border-border bg-card p-3">
        <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-3 px-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Tag Vault
          </span>
          {selectedTag && (
            <button
              onClick={() => onSelectTag(null)}
              className="text-[10px] text-primary hover:underline font-bold lowercase"
            >
              clear
            </button>
          )}
        </h4>

        {allTags.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2">
            No tags yet. Add tags to bookmarks for rapid filtering.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 px-1 max-h-48 overflow-y-auto">
            {allTags.map(({ tag, count }) => {
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => {
                    onSelectTag(isSelected ? null : tag);
                    onSelectFilter("all");
                  }}
                  className={`pop-3d inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-bold uppercase transition-all border ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 text-muted-foreground border-border/70 hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <Hash className="w-2.5 h-2.5" />
                  <span>{tag}</span>
                  <span className="text-[9px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
