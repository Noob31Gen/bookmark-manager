import { useState } from "react";
import {
  ExternalLink,
  Star,
  Copy,
  Check,
  Edit2,
  Trash2,
  Camera,
  Globe,
  CheckSquare,
  Square,
  Compass,
  ArrowUpRight,
} from "lucide-react";
import { EnhancedBookmark, ViewMode, MainViewThumbnail, ClickAction } from "../lib/types";
import { getDomain, getFaviconUrl } from "../lib/utils";
import { Card } from "./ui/Card";
import { HttpStatusBadge } from "./HttpStatusBadge";

interface BookmarkCardProps {
  bookmark: EnhancedBookmark;
  viewMode: ViewMode;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (bookmark: EnhancedBookmark) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onOpenBrowse: (bookmark: EnhancedBookmark) => void;
  onCaptureScreenshot: (bookmark: EnhancedBookmark) => void;
  onSelectTag: (tag: string) => void;
  mainViewThumbnail?: MainViewThumbnail;
  clickAction?: ClickAction;
}

export function BookmarkCard({
  bookmark,
  viewMode,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  onToggleFavorite,
  onOpenBrowse,
  onCaptureScreenshot,
  onSelectTag,
  mainViewThumbnail = "auto",
  clickAction = "browse_mode",
}: BookmarkCardProps) {
  const [copied, setCopied] = useState(false);
  const domain = getDomain(bookmark.url);
  const favicon = bookmark.favicon || getFaviconUrl(bookmark.url);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (bookmark.url) {
      navigator.clipboard.writeText(bookmark.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Resolve thumbnail based on user preferences
  let thumbnail: string | undefined;
  if (mainViewThumbnail === "screenshot_only") {
    thumbnail = bookmark.screenshot;
  } else if (mainViewThumbnail === "embed_only") {
    thumbnail = bookmark.ogImage;
  } else if (mainViewThumbnail === "none") {
    thumbnail = undefined;
  } else {
    // auto
    thumbnail = bookmark.screenshot || bookmark.ogImage;
  }

  const showBanner = viewMode === "cards" && mainViewThumbnail !== "none";
  const isRedirected = bookmark.isRedirect || (!!bookmark.finalUrl && bookmark.finalUrl !== bookmark.url);

  const handleTitleClick = (e: React.MouseEvent) => {
    if (clickAction === "browse_mode") {
      e.preventDefault();
      onOpenBrowse(bookmark);
    }
  };

  return (
    <Card
      className={`pop-3d group h-full flex flex-col justify-between transition-all relative ${
        isSelected
          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary"
          : "border-border bg-card"
      }`}
    >
      {/* Checkbox Selector */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(bookmark.id);
        }}
        className="absolute top-2 left-2 z-20 p-1 bg-background/90 hover:bg-background border border-border text-foreground transition-colors cursor-pointer"
        title={isSelected ? "Deselect" : "Select"}
      >
        {isSelected ? (
          <CheckSquare className="w-4 h-4 text-primary" />
        ) : (
          <Square className="w-4 h-4 text-muted-foreground opacity-60 group-hover:opacity-100" />
        )}
      </button>

      <div>
        {/* Visual Snapshot Banner */}
        {showBanner && (
          <div
            onClick={() => onOpenBrowse(bookmark)}
            className="relative w-full aspect-video bg-muted/60 border-b border-border overflow-hidden flex items-center justify-center cursor-pointer"
          >
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={bookmark.title}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground gap-1.5 p-4 text-center">
                {mainViewThumbnail === "icon_only" && favicon ? (
                  <img src={favicon} alt="" className="size-10 object-contain" />
                ) : (
                  <Globe className="w-8 h-8 stroke-1 text-muted-foreground/60" />
                )}
                <span className="text-xs font-mono font-bold uppercase tracking-wider">
                  {domain}
                </span>
              </div>
            )}

            {/* HTTP Status Badge & Redirect Pill & Screenshot Trigger Overlay */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
              {isRedirected && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-amber-500/20 text-amber-500 border border-amber-500/40 select-none"
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

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCaptureScreenshot(bookmark);
                }}
                className="p-1 bg-background/90 hover:text-primary text-muted-foreground border border-border opacity-0 group-hover:opacity-100 transition-opacity"
                title="Capture / Update Screenshot"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Card Header Content */}
        <div className={`p-4 space-y-3 ${showBanner ? "" : "pt-8"}`}>
          {!showBanner && (
            <div className="flex items-center justify-end gap-1.5 mb-1">
              {isRedirected && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-amber-500/20 text-amber-500 border border-amber-500/40 select-none"
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
          )}

          <div className="flex items-start justify-between gap-2">
            {/* Favicon & Title */}
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              <img
                src={favicon}
                alt=""
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
                className="w-4 h-4 mt-0.5 object-contain flex-shrink-0"
              />
              <a
                href={bookmark.url}
                onClick={handleTitleClick}
                target={clickAction === "open_link" ? "_blank" : undefined}
                rel="noreferrer"
                className="font-bold text-sm leading-snug tracking-tight text-foreground hover:text-primary transition-colors line-clamp-2 cursor-pointer"
                title={bookmark.title}
              >
                {bookmark.title}
              </a>
            </div>

            {/* Favorite Star Button */}
            <button
              type="button"
              onClick={() => onToggleFavorite(bookmark.id, !bookmark.isFavorite)}
              className="p-1 text-muted-foreground hover:text-amber-400 transition-colors flex-shrink-0 cursor-pointer"
              title={bookmark.isFavorite ? "Remove from Starred" : "Add to Starred"}
            >
              <Star
                className={`w-4 h-4 ${
                  bookmark.isFavorite
                    ? "text-amber-400 fill-amber-400"
                    : "text-muted-foreground/50"
                }`}
              />
            </button>
          </div>

          {/* Description or Notes preview */}
          {(bookmark.description || bookmark.notes) && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {bookmark.description || bookmark.notes}
            </p>
          )}

          {/* Tags */}
          {bookmark.tags && bookmark.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {bookmark.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag(tag)}
                  className="px-1.5 py-0.5 text-[10px] uppercase font-mono font-bold bg-muted/60 hover:bg-primary/20 hover:text-primary text-muted-foreground border border-border/70 transition-all cursor-pointer"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Details & Action Strip */}
      <div className="border-t border-border bg-muted/30 p-2.5 flex items-center justify-between gap-2 mt-auto">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-mono text-muted-foreground hover:text-primary font-bold truncate flex items-center gap-1 max-w-[130px]"
          title={bookmark.url}
        >
          <span>{domain}</span>
          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
        </a>

        <div className="flex items-center gap-1">
          {/* Browse Mode Button */}
          <button
            onClick={() => onOpenBrowse(bookmark)}
            className="p-1 hover:text-primary text-muted-foreground"
            title="Open Browse Mode (Expanded View)"
          >
            <Compass className="w-3.5 h-3.5 text-primary" />
          </button>

          <button
            onClick={handleCopy}
            className="p-1 hover:text-primary text-muted-foreground"
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
            className="p-1 hover:text-primary text-muted-foreground"
            title="Edit Bookmark"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onDelete(bookmark.id)}
            className="p-1 hover:text-destructive text-muted-foreground"
            title="Delete Bookmark"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Card>
  );
}
