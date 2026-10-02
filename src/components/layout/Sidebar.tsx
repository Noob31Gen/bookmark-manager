import { useState, useMemo } from "react";
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
  Globe,
  ShieldAlert,
  ShieldCheck,
  CheckSquare,
  Square,
  ArrowUpRight,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";
import { FolderNode } from "../../lib/types";

interface SidebarProps {
  folders: FolderNode[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  selectedFolderIds: Set<string>;
  onToggleFolderSelect: (folderId: string) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  allTags: { tag: string; count: number }[];
  selectedDomain: string | null;
  onSelectDomain: (domain: string | null) => void;
  allDomains: { domain: string; count: number }[];
  httpCodeFilter: "healthy" | "redirects" | "errors" | "unfetched" | null;
  onSelectHttpCodeFilter: (code: "healthy" | "redirects" | "errors" | "unfetched" | null) => void;
  activeFilter: "all" | "starred" | "recent" | "snapshots" | "untagged";
  onSelectFilter: (filter: "all" | "starred" | "recent" | "snapshots" | "untagged") => void;
  totalBookmarksCount: number;
  starredCount: number;
  snapshotCount: number;
  statusCounts: {
    healthy: number;
    redirects: number;
    errors: number;
    unfetched: number;
  };
}

export function Sidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  selectedFolderIds,
  onToggleFolderSelect,
  selectedTag,
  onSelectTag,
  allTags,
  selectedDomain,
  onSelectDomain,
  allDomains,
  httpCodeFilter,
  onSelectHttpCodeFilter,
  activeFilter,
  onSelectFilter,
  totalBookmarksCount,
  starredCount,
  snapshotCount,
  statusCounts,
}: SidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    "1": true,
    "2": true,
  });
  const [domainSearch, setDomainSearch] = useState("");

  const toggleFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredDomains = useMemo(() => {
    if (!domainSearch.trim()) return allDomains.slice(0, 10);
    return allDomains.filter((d) => d.domain.toLowerCase().includes(domainSearch.toLowerCase()));
  }, [allDomains, domainSearch]);

  const renderFolderItem = (folder: FolderNode, depth = 0) => {
    const isFiltered = selectedFolderId === folder.id;
    const isMultiSelected = selectedFolderIds.has(folder.id);
    const isExpanded = expandedFolders[folder.id] ?? true;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id} className="flex flex-col">
        <div
          onClick={() => {
            onSelectFilter("all");
            onSelectTag(null);
            onSelectFolder(isFiltered ? null : folder.id);
          }}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          className={`group flex items-center justify-between pr-2.5 py-1.5 cursor-pointer text-xs font-semibold uppercase tracking-wide border-l-2 transition-all ${
            isFiltered
              ? "bg-primary/10 border-primary text-primary font-bold"
              : isMultiSelected
              ? "bg-primary/5 border-primary/50 text-foreground"
              : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            {/* Multi-select checkbox for folder */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFolderSelect(folder.id);
              }}
              className="p-0.5 hover:text-primary text-muted-foreground"
              title={isMultiSelected ? "Deselect folder" : "Select folder for batch actions"}
            >
              {isMultiSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Square className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-foreground" />
              )}
            </button>

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
              <span className="w-2" />
            )}

            {isFiltered ? (
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
    <aside className="w-full md:w-64 lg:w-72 flex-shrink-0 flex flex-col gap-5 select-none">
      {/* Library Views */}
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
              onSelectDomain(null);
              onSelectHttpCodeFilter(null);
            }}
            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold uppercase transition-all ${
              activeFilter === "all" && !selectedFolderId && !selectedTag && !selectedDomain && !httpCodeFilter
                ? "bg-primary text-primary-foreground border border-primary font-extrabold"
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
            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold uppercase transition-all ${
              activeFilter === "starred"
                ? "bg-primary text-primary-foreground border border-primary font-extrabold"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
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
            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold uppercase transition-all ${
              activeFilter === "snapshots"
                ? "bg-primary text-primary-foreground border border-primary font-extrabold"
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
            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold uppercase transition-all ${
              activeFilter === "recent"
                ? "bg-primary text-primary-foreground border border-primary font-extrabold"
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

      {/* HTTP Status & Diagnostics Filter Section */}
      <div className="flex flex-col border border-border bg-card p-3">
        <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-2 px-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Status & Health
          </span>
          {httpCodeFilter && (
            <button
              onClick={() => onSelectHttpCodeFilter(null)}
              className="text-[10px] text-primary hover:underline font-bold lowercase"
            >
              clear
            </button>
          )}
        </h4>

        <div className="space-y-1">
          {/* Healthy Filter */}
          <button
            onClick={() => onSelectHttpCodeFilter(httpCodeFilter === "healthy" ? null : "healthy")}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-bold uppercase transition-all border ${
              httpCodeFilter === "healthy"
                ? "bg-green-500/20 text-green-500 border-green-500 font-extrabold"
                : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              <span>Healthy (200 OK)</span>
            </span>
            <span className="font-mono text-[11px]">{statusCounts.healthy}</span>
          </button>

          {/* Redirects Filter */}
          <button
            onClick={() => onSelectHttpCodeFilter(httpCodeFilter === "redirects" ? null : "redirects")}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-bold uppercase transition-all border ${
              httpCodeFilter === "redirects"
                ? "bg-amber-500/20 text-amber-500 border-amber-500 font-extrabold"
                : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-amber-500" />
              <span>Redirects (3xx)</span>
            </span>
            <span className="font-mono text-[11px]">{statusCounts.redirects}</span>
          </button>

          {/* Errors Filter */}
          <button
            onClick={() => onSelectHttpCodeFilter(httpCodeFilter === "errors" ? null : "errors")}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-bold uppercase transition-all border ${
              httpCodeFilter === "errors"
                ? "bg-red-500/20 text-red-500 border-red-500 font-extrabold"
                : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <span>Errors (4xx / 5xx)</span>
            </span>
            <span className="font-mono text-[11px]">{statusCounts.errors}</span>
          </button>

          {/* Unfetched Filter */}
          <button
            onClick={() => onSelectHttpCodeFilter(httpCodeFilter === "unfetched" ? null : "unfetched")}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-bold uppercase transition-all border ${
              httpCodeFilter === "unfetched"
                ? "bg-muted text-foreground border-primary font-extrabold"
                : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-muted-foreground/60" />
              <span>Unfetched</span>
            </span>
            <span className="font-mono text-[11px]">{statusCounts.unfetched}</span>
          </button>
        </div>
      </div>

      {/* Chrome Bookmarks Folders */}
      <div className="flex flex-col border border-border bg-card p-3">
        <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-2 px-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5" /> Chrome Folders
          </span>
          {selectedFolderId && (
            <button
              onClick={() => onSelectFolder(null)}
              className="text-[10px] text-primary hover:underline font-bold lowercase cursor-pointer"
            >
              clear
            </button>
          )}
        </h4>

        <div className="space-y-0.5 max-h-56 md:max-h-[300px] overflow-y-auto">
          {folders.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1">No folders found</p>
          ) : (
            folders.map((f) => renderFolderItem(f))
          )}
        </div>
      </div>

      {/* Domains Filter */}
      <div className="flex flex-col border border-border bg-card p-3">
        <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-2 px-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Domain Filter
          </span>
          {selectedDomain && (
            <button
              onClick={() => onSelectDomain(null)}
              className="text-[10px] text-primary hover:underline font-bold lowercase cursor-pointer"
            >
              clear
            </button>
          )}
        </h4>

        {allDomains.length > 5 && (
          <input
            type="text"
            value={domainSearch}
            onChange={(e) => setDomainSearch(e.target.value)}
            placeholder="Search domains..."
            className="w-full bg-background border border-input px-2 py-1 text-xs text-foreground mb-2 outline-none focus:border-primary"
          />
        )}

        <div className="space-y-0.5 max-h-40 md:max-h-36 overflow-y-auto">
          {filteredDomains.map(({ domain, count }) => {
            const isSelected = selectedDomain === domain;
            return (
              <button
                key={domain}
                onClick={() => onSelectDomain(isSelected ? null : domain)}
                className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-mono transition-all text-left cursor-pointer ${
                  isSelected
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="truncate">{domain}</span>
                <span className="text-[10px] opacity-75 font-bold">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags Cloud */}
      <div className="flex flex-col border border-border bg-card p-3">
        <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground mb-2 px-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Tag Vault
          </span>
          {selectedTag && (
            <button
              onClick={() => onSelectTag(null)}
              className="text-[10px] text-primary hover:underline font-bold lowercase cursor-pointer"
            >
              clear
            </button>
          )}
        </h4>

        {allTags.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2">No tags created yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 px-1 max-h-48 md:max-h-40 overflow-y-auto">
            {allTags.map(({ tag, count }) => {
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => {
                    onSelectTag(isSelected ? null : tag);
                    onSelectFilter("all");
                  }}
                  className={`pop-3d inline-flex items-center gap-1 px-2 py-1 text-xs font-mono font-bold uppercase transition-all border cursor-pointer ${
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
