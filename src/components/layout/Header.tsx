import {
  Plus,
  Settings,
  LayoutGrid,
  List,
  Sparkles,
  FolderPlus,
  RefreshCw,
  RotateCw,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "../ui/Button";
import { ThemeToggle } from "./ThemeToggle";
import { GitHubSyncStatus } from "../GitHubSyncStatus";
import { GitHubConfig, ViewMode, SortField } from "../../lib/types";

interface HeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortField: SortField;
  onSortFieldChange: (sort: SortField) => void;
  onOpenAddBookmark: () => void;
  onOpenAddFolder: () => void;
  onOpenSettings: () => void;
  onRefetchAll: () => void;
  onReloadVault: () => void;
  isReloading?: boolean;
  gitHubConfig: GitHubConfig;
  onGitHubConfigChange: () => void;
  totalBookmarks: number;
}

export function Header({
  viewMode,
  onViewModeChange,
  sortField,
  onSortFieldChange,
  onOpenAddBookmark,
  onOpenAddFolder,
  onOpenSettings,
  onRefetchAll,
  onReloadVault,
  isReloading,
  gitHubConfig,
  onGitHubConfigChange,
  totalBookmarks,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur-md transition-colors">
      <div className="flex min-h-[64px] items-center justify-between px-3 md:px-6 w-full max-w-[1600px] mx-auto gap-2 sm:gap-3 py-2">
        {/* Brand / Title (Never shrinks) */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="size-8 md:size-9 bg-primary flex items-center justify-center text-primary-foreground border border-primary font-black text-sm md:text-base select-none">
            N31
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg md:text-xl font-extrabold tracking-tight text-foreground uppercase whitespace-nowrap">
              <span className="marker-slanted">Bookmark</span> Vault
            </span>
            <span className="hidden sm:inline-block text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 border border-border uppercase font-mono font-bold whitespace-nowrap">
              {totalBookmarks} saved
            </span>
          </div>
        </div>

        {/* Right Action Tools Strip (Clean single-row, no awkward wrap breaking) */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 overflow-x-auto no-scrollbar py-0.5">
          {/* Sort By Dropdown */}
          <div className="flex items-center border border-border bg-muted/40 px-2 py-1 gap-1 text-xs flex-shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <select
              value={sortField}
              onChange={(e) => onSortFieldChange(e.target.value as SortField)}
              className="bg-transparent text-[11px] md:text-xs font-bold uppercase text-foreground outline-none cursor-pointer"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="title-asc">Title (A-Z)</option>
              <option value="title-desc">Title (Z-A)</option>
              <option value="domain-asc">Domain (A-Z)</option>
              <option value="http-status">HTTP Errors First</option>
              <option value="starred-first">Starred First</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="hidden md:flex items-center border border-border bg-muted/40 p-0.5 flex-shrink-0">
            <button
              onClick={() => onViewModeChange("cards")}
              className={`px-2 py-1 text-[11px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === "cards"
                  ? "bg-primary text-primary-foreground font-extrabold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Snapshot Card View"
            >
              <Sparkles className="w-3 h-3" />
              Cards
            </button>
            <button
              onClick={() => onViewModeChange("grid")}
              className={`px-2 py-1 text-[11px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground font-extrabold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Grid Box View"
            >
              <LayoutGrid className="w-3 h-3" />
              Grid
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={`px-2 py-1 text-[11px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground font-extrabold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Compact Table View"
            >
              <List className="w-3 h-3" />
              List
            </button>
          </div>

          {/* Reload Local Vault Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onReloadVault}
            disabled={isReloading}
            className="gap-1.5 font-bold text-xs flex-shrink-0"
            title="Reload bookmarks, folders, and assets from Chrome & storage without network refetching"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isReloading ? "animate-spin text-primary" : "text-foreground"}`} />
            <span className="hidden xl:inline">{isReloading ? "Reloading..." : "Reload Vault"}</span>
          </Button>

          {/* Refetch All Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefetchAll}
            className="gap-1.5 font-bold text-xs flex-shrink-0"
            title="Refetch HTTP Status, Icons, and Embeds for all bookmarks over the network"
          >
            <RefreshCw className="w-3.5 h-3.5 text-primary" />
            <span className="hidden xl:inline">Refetch All</span>
          </Button>

          {/* GitHub Sync Status */}
          <div className="flex-shrink-0">
            <GitHubSyncStatus
              config={gitHubConfig}
              onConfigChange={onGitHubConfigChange}
              onOpenSettings={onOpenSettings}
            />
          </div>

          {/* Add Folder Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenAddFolder}
            className="hidden lg:inline-flex gap-1.5 font-bold text-xs flex-shrink-0"
            title="Create Bookmark Folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Folder</span>
          </Button>

          {/* Add Bookmark Button */}
          <Button
            variant="default"
            size="sm"
            onClick={onOpenAddBookmark}
            className="gap-1.5 font-bold text-xs flex-shrink-0"
            title="Add New Bookmark (Ctrl+N)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Bookmark</span>
          </Button>

          {/* Settings & Theme Toggle Cluster (Always together) */}
          <div className="flex items-center gap-1 pl-1 border-l border-border flex-shrink-0">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onOpenSettings}
              title="Settings & Cloud Backup"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>

            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
