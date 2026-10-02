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
      className={`pop-3d group flex items-center justify-between p-3 border transition-colors gap-4 ${
        isSelected
          ? "border-primary bg-primary/10 ring-1 ring-primary"
          : "border-border bg-card hover:bg-muted/40"
      }`}
    >
      {/* Selector & Favicon & Title */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
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
          className="p-1 text-muted-foreground hover:text-amber-400 transition-colors flex-shrink-0"
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
            className="font-bold text-sm text-foreground hover:text-primary transition-colors truncate cursor-pointer"
            title={bookmark.title}
          >
            {bookmark.title}
          </a>
          <span className="text-[11px] font-mono text-muted-foreground truncate">
            {domain}
          </span>
        </div>
      </div>

      {/* Redirect Indicator */}
      {isRedirected && (
        <span
          className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-amber-500/20 text-amber-500 border border-amber-500/40 select-none flex-shrink-0"
          title={`Redirected to: ${bookmark.finalUrl || "different location"}`}
        >
          <ArrowUpRight className="w-3 h-3" />
          <span>Redirect</span>
        </span>
      )}

      {/* HTTP Status Code Badge */}
      <div className="flex-shrink-0">
        <HttpStatusBadge
          status={bookmark.httpStatus}
          statusText={bookmark.httpStatusText}
        />
      </div>

      {/* Tags */}
      <div className="hidden md:flex items-center gap-1.5 flex-wrap max-w-xs">
        {bookmark.tags.slice(0, 3).map((tag) => (
          <button
            key={tag}
            onClick={() => onSelectTag(tag)}
            className="px-1.5 py-0.5 text-[10px] uppercase font-mono font-bold bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground border border-border transition-all"
          >
            #{tag}
          </button>
        ))}
      </div>

      {/* Date */}
      <div className="hidden lg:block text-xs font-mono text-muted-foreground/80 whitespace-nowrap">
        {formatDate(bookmark.dateAdded)}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
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
  );
}
