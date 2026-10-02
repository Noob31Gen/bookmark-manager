import { Bookmark, Plus, Settings, LayoutGrid, List, Sparkles, FolderPlus } from "lucide-react";
import { Button } from "../ui/Button";
import { ThemeToggle } from "./ThemeToggle";
import { GitHubSyncStatus } from "../GitHubSyncStatus";
import { GitHubConfig, ViewMode } from "../../lib/types";

interface HeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenAddBookmark: () => void;
  onOpenAddFolder: () => void;
  onOpenSettings: () => void;
  gitHubConfig: GitHubConfig;
  onGitHubConfigChange: () => void;
  totalBookmarks: number;
}

export function Header({
  viewMode,
  onViewModeChange,
  onOpenAddBookmark,
  onOpenAddFolder,
  onOpenSettings,
  gitHubConfig,
  onGitHubConfigChange,
  totalBookmarks,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur-md transition-colors">
      <div className="flex h-16 items-center justify-between px-4 md:px-8 max-w-7xl mx-auto gap-4">
        {/* Brand / Title */}
        <div className="flex items-center gap-3">
          <div className="size-9 bg-primary flex items-center justify-center text-primary-foreground border border-primary font-black text-lg select-none">
            N31
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight text-foreground uppercase">
                <span className="marker-slanted">Bookmark</span> Vault
              </span>
              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 border border-border uppercase font-mono font-bold">
                {totalBookmarks} saved
              </span>
            </div>
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* View Mode Toggle */}
          <div className="hidden sm:flex items-center border border-border bg-muted/30 p-0.5">
            <button
              onClick={() => onViewModeChange("cards")}
              className={`px-2.5 py-1 text-xs font-bold uppercase transition-all flex items-center gap-1.5 ${
                viewMode === "cards"
                  ? "bg-primary text-primary-foreground font-extrabold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Snapshot Card View"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Cards
            </button>
            <button
              onClick={() => onViewModeChange("grid")}
              className={`px-2.5 py-1 text-xs font-bold uppercase transition-all flex items-center gap-1.5 ${
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground font-extrabold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Grid Box View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Grid
            </button>
            <button
              onClick={() => onViewModeChange("list")}
              className={`px-2.5 py-1 text-xs font-bold uppercase transition-all flex items-center gap-1.5 ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground font-extrabold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Compact Table View"
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
          </div>

          {/* GitHub Sync Status */}
          <GitHubSyncStatus
            config={gitHubConfig}
            onConfigChange={onGitHubConfigChange}
            onOpenSettings={onOpenSettings}
          />

          {/* Add Folder Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenAddFolder}
            className="hidden lg:inline-flex gap-1.5 font-bold"
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
            className="gap-1.5 font-bold"
            title="Add New Bookmark (Ctrl+N)"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Bookmark</span>
          </Button>

          {/* Settings Button */}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onOpenSettings}
            title="Settings & Cloud Backup"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>

          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
