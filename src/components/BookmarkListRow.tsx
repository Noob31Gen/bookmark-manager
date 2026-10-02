import { useState } from "react";
import {
  ExternalLink,
  Star,
  Copy,
  Check,
  Edit2,
  Trash2,
  CheckSquare,
  Square,
  Compass,
  ArrowUpRight,
} from "lucide-react";
import { EnhancedBookmark, ClickAction } from "../lib/types";
import { getDomain, getFaviconUrl, formatDate } from "../lib/utils";
import { HttpStatusBadge } from "./HttpStatusBadge";

interface BookmarkListRowProps {
  bookmark: EnhancedBookmark;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (bookmark: EnhancedBookmark) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onOpenBrowse: (bookmark: EnhancedBookmark) => void;
  onSelectTag: (tag: string) => void;
  clickAction?: ClickAction;
}

export function BookmarkListRow({
  bookmark,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  onToggleFavorite,
  onOpenBrowse,
  onSelectTag,
  clickAction = "browse_mode",
}: BookmarkListRowProps) {
  const [copied, setCopied] = useState(false);
  const domain = getDomain(bookmark.url);
  const favicon = bookmark.favicon || getFaviconUrl(bookmark.url);
  const isRedirected = bookmark.isRedirect || (!!bookmark.finalUrl && bookmark.finalUrl !== bookmark.url);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (bookmark.url) {
      navigator.clipboard.writeText(bookmark.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTitleClick = (e: React.MouseEvent) => {
    if (clickAction === "browse_mode") {
      e.preventDefault();
      onOpenBrowse(bookmark);
    }
  };

  return (
    <div
      className={`pop-3d group flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 border transition-colors gap-2 sm:gap-4 ${
        isSelected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "border-border bg-card hover:bg-muted/40"
      }`}
    >
      {/* Top / Main Line: Selector, Favicon, Title, Badges */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(bookmark.id);
          }}
          className="p-1 hover:text-primary text-muted-foreground cursor-pointer flex-shrink-0"
          title={isSelected ? "Deselect" : "Select"}
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-primary" />
          ) : (
            <Square className="w-4 h-4 text-muted-foreground opacity-60 group-hover:opacity-100" />
          )}
        </button>

        <button
          onClick={() => onToggleFavorite(bookmark.id, !bookmark.isFavorite)}
          className="p-1 text-muted-foreground hover:text-amber-400 transition-colors flex-shrink-0 cursor-pointer"
          title={bookmark.isFavorite ? "Remove from starred" : "Add to starred"}
        >
          <Star
            className={`w-4 h-4 ${
              bookmark.isFavorite
                ? "text-amber-400 fill-amber-400"
                : "text-muted-foreground/40"
            }`}
          />
        </button>

        <img
          src={favicon}
          alt=""
          onError={(e) => {
            (e.target as HTMLElement).style.display = "none";
          }}
          className="w-4 h-4 object-contain flex-shrink-0"
        />

        <div className="flex flex-col min-w-0 flex-1">
          <a
            href={bookmark.url}
            onClick={handleTitleClick}
            target={clickAction === "open_link" ? "_blank" : undefined}
            rel="noreferrer"
            className="font-bold text-xs sm:text-sm text-foreground hover:text-primary transition-colors truncate cursor-pointer"
            title={bookmark.title}
          >
            {bookmark.title}
          </a>
          {/* Desktop domain subtitle */}
          <span className="hidden sm:inline-block text-[11px] font-mono text-muted-foreground truncate">
            {domain}
          </span>
        </div>

        {/* Mobile: HTTP status code badge in top row */}
        <div className="sm:hidden flex-shrink-0">
          <HttpStatusBadge
            status={bookmark.httpStatus}
            statusText={bookmark.httpStatusText}
          />
        </div>
      </div>

      {/* Desktop HTTP Status Code Badge & Redirect Indicator */}
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        {isRedirected && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-amber-500/20 text-amber-500 border border-amber-500/40 select-none flex-shrink-0"
            title={`Redirected to: ${bookmark.finalUrl || "different location"}`}
          >
            <ArrowUpRight className="w-3 h-3" />
            <span>Redirect</span>
          </span>
        )}

        <HttpStatusBadge
          status={bookmark.httpStatus}
          statusText={bookmark.httpStatusText}
        />
      </div>

      {/* Tags (Desktop) */}
      <div className="hidden md:flex items-center gap-1.5 flex-wrap max-w-xs">
        {bookmark.tags.slice(0, 3).map((tag) => (
          <button
            key={tag}
            onClick={() => onSelectTag(tag)}
            className="px-1.5 py-0.5 text-[10px] uppercase font-mono font-bold bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground border border-border transition-all cursor-pointer"
          >
            #{tag}
          </button>
        ))}
      </div>

      {/* Date (Large Desktop) */}
      <div className="hidden lg:block text-xs font-mono text-muted-foreground/80 whitespace-nowrap">
        {formatDate(bookmark.dateAdded)}
      </div>

      {/* Bottom Sub-row on Mobile / Action tools on Desktop */}
      <div className="flex items-center justify-between sm:justify-end gap-2 pt-1.5 sm:pt-0 border-t border-border/50 sm:border-t-0 pl-7 sm:pl-0">
        {/* Mobile domain & redirect info */}
        <div className="sm:hidden flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-[10px] font-mono font-bold text-muted-foreground truncate">
            {domain}
          </span>
          {isRedirected && (
            <span className="text-[9px] font-mono text-amber-500 font-bold flex items-center">
              <ArrowUpRight className="w-2.5 h-2.5" /> 3xx
            </span>
          )}
        </div>

        {/* Actions Button Strip */}
        <div className="flex items-center gap-1 sm:gap-1.5 opacity-90 sm:opacity-80 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {/* Browse Mode Button */}
          <button
            onClick={() => onOpenBrowse(bookmark)}
            className="pop-3d p-1.5 bg-card hover:bg-muted hover:text-primary text-muted-foreground transition-colors cursor-pointer"
            title="Open Browse Mode (Expanded View)"
          >
            <Compass className="w-3.5 h-3.5 text-primary" />
          </button>

          <button
            onClick={handleCopy}
            className="pop-3d p-1.5 bg-card hover:bg-muted hover:text-primary text-muted-foreground transition-colors cursor-pointer"
            title="Copy URL"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={() => onEdit(bookmark)}
            className="pop-3d p-1.5 bg-card hover:bg-muted hover:text-primary text-muted-foreground transition-colors cursor-pointer"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onDelete(bookmark.id)}
            className="pop-3d p-1.5 bg-card hover:bg-muted hover:text-destructive text-muted-foreground transition-colors cursor-pointer"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <a
            href={bookmark.url}
            target="_blank"
            rel="noreferrer"
            className="pop-3d p-1.5 bg-card hover:bg-muted hover:text-primary text-muted-foreground transition-colors cursor-pointer"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
