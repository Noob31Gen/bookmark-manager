import { useState, useRef, useEffect } from "react";
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
  MoreVertical,
  Check,
  Folder,
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur-md transition-colors">
      <div className="flex min-h-[56px] sm:min-h-[64px] items-center justify-between px-2.5 sm:px-4 md:px-6 w-full max-w-[1600px] mx-auto gap-1.5 sm:gap-3 py-1.5 sm:py-2">
        {/* Brand / Logo */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
          <div className="size-7 sm:size-8 md:size-9 bg-primary flex items-center justify-center text-primary-foreground border border-primary font-black text-xs sm:text-sm md:text-base select-none">
            N31
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-base sm:text-lg md:text-xl font-extrabold tracking-tight text-foreground uppercase whitespace-nowrap">
              <span className="marker-slanted">Vault</span>
            </span>
            <span className="hidden md:inline-block text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 border border-border uppercase font-mono font-bold whitespace-nowrap">
              {totalBookmarks} saved
            </span>
          </div>
        </div>

        {/* Right Action Tools Strip */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Sort By Dropdown (Compact, fits all screens) */}
          <div className="flex items-center border border-border bg-muted/40 px-1.5 sm:px-2 py-1 gap-1 text-xs flex-shrink-0">
            <ArrowUpDown className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-muted-foreground flex-shrink-0" />
            <select
              value={sortField}
              onChange={(e) => onSortFieldChange(e.target.value as SortField)}
              className="bg-transparent text-[10px] sm:text-xs font-bold uppercase text-foreground outline-none cursor-pointer max-w-[100px] sm:max-w-none"
            >
              <option value="date-desc">Newest</option>
              <option value="date-asc">Oldest</option>
              <option value="title-asc">Title (A-Z)</option>
              <option value="title-desc">Title (Z-A)</option>
              <option value="domain-asc">Domain (A-Z)</option>
              <option value="http-status">Errors First</option>
              <option value="starred-first">Starred First</option>
            </select>
          </div>

          {/* Desktop View Mode Toggle (hidden on mobile/tablet < xl) */}
          <div className="hidden xl:flex items-center border border-border bg-muted/40 p-0.5 flex-shrink-0">
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

          {/* Desktop Reload Vault Button (hidden < xl) */}
          <Button
            variant="outline"
            size="sm"
            onClick={onReloadVault}
            disabled={isReloading}
            className="hidden xl:inline-flex gap-1.5 font-bold text-xs flex-shrink-0"
            title="Reload bookmarks, folders, and assets from Chrome & storage"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isReloading ? "animate-spin text-primary" : "text-foreground"}`} />
            <span>{isReloading ? "Reloading..." : "Reload"}</span>
          </Button>

          {/* Desktop Refetch All Button (hidden < xl) */}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefetchAll}
            className="hidden xl:inline-flex gap-1.5 font-bold text-xs flex-shrink-0"
            title="Refetch HTTP Status, Icons, and Embeds for all bookmarks"
          >
            <RefreshCw className="w-3.5 h-3.5 text-primary" />
            <span>Refetch All</span>
          </Button>

          {/* Desktop GitHub Sync Status (hidden < xl) */}
          <div className="hidden xl:block flex-shrink-0">
            <GitHubSyncStatus
              config={gitHubConfig}
              onConfigChange={onGitHubConfigChange}
              onOpenSettings={onOpenSettings}
            />
          </div>

          {/* Desktop Add Folder Button (hidden < xl) */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenAddFolder}
            className="hidden xl:inline-flex gap-1.5 font-bold text-xs flex-shrink-0"
            title="Create Bookmark Folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Folder</span>
          </Button>

          {/* Mobile & Tablet "More Actions / Tools" Dropdown (< xl) */}
          <div className="relative xl:hidden flex-shrink-0" ref={dropdownRef}>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              title="More Actions & Tools"
              aria-label="More Actions"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 bg-card border-2 border-border shadow-2xl p-2 min-w-[220px] flex flex-col gap-1 animate-in zoom-in-95 duration-150">
                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-2 py-1 border-b border-border">
                  Display View
                </div>

                {/* View Mode options in dropdown */}
                <button
                  onClick={() => {
                    onViewModeChange("cards");
                    setDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 text-xs font-bold uppercase transition-colors text-left cursor-pointer ${
                    viewMode === "cards" ? "bg-primary text-primary-foreground font-extrabold" : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" /> Cards View
                  </span>
                  {viewMode === "cards" && <Check className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={() => {
                    onViewModeChange("grid");
                    setDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 text-xs font-bold uppercase transition-colors text-left cursor-pointer ${
                    viewMode === "grid" ? "bg-primary text-primary-foreground font-extrabold" : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <LayoutGrid className="w-3.5 h-3.5" /> Grid Box View
                  </span>
                  {viewMode === "grid" && <Check className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={() => {
                    onViewModeChange("list");
                    setDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-2.5 py-1.5 text-xs font-bold uppercase transition-colors text-left cursor-pointer ${
                    viewMode === "list" ? "bg-primary text-primary-foreground font-extrabold" : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <List className="w-3.5 h-3.5" /> Compact List View
                  </span>
                  {viewMode === "list" && <Check className="w-3.5 h-3.5" />}
                </button>

                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground px-2 py-1 mt-1 border-t border-border">
                  Vault Actions
                </div>

                {/* Reload local vault */}
                <button
                  onClick={() => {
                    onReloadVault();
                    setDropdownOpen(false);
                  }}
                  disabled={isReloading}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold uppercase hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isReloading ? "animate-spin text-primary" : ""}`} />
                  <span>Reload Local Vault</span>
                </button>

                {/* Refetch all over network */}
                <button
                  onClick={() => {
                    onRefetchAll();
                    setDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold uppercase hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-primary" />
                  <span>Refetch All Bookmarks</span>
                </button>

                {/* Add folder */}
                <button
                  onClick={() => {
                    onOpenAddFolder();
                    setDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold uppercase hover:bg-muted text-foreground transition-colors text-left cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>New Folder</span>
                </button>

                {/* GitHub Sync */}
                <div className="pt-1 mt-1 border-t border-border px-1">
                  <GitHubSyncStatus
                    config={gitHubConfig}
                    onConfigChange={onGitHubConfigChange}
                    onOpenSettings={() => {
                      setDropdownOpen(false);
                      onOpenSettings();
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Add Bookmark Button */}
          <Button
            variant="default"
            size="sm"
            onClick={onOpenAddBookmark}
            className="gap-1 font-bold text-xs flex-shrink-0 px-2 sm:px-3"
            title="Add New Bookmark (Ctrl+N)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add</span>
          </Button>

          {/* Settings & Theme Toggle Cluster */}
          <div className="flex items-center gap-1 pl-1 border-l border-border flex-shrink-0">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onOpenSettings}
              title="Settings & Preferences"
              aria-label="Settings"
            >
              <Settings className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            </Button>

            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
