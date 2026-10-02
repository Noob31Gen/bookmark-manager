import { useState } from "react";
import {
  ExternalLink,
  Star,
  Copy,
  Check,
  Edit2,
  Trash2,
  BookOpen,
  Camera,
  Globe,
  Tag as TagIcon,
  StickyNote,
} from "lucide-react";
import { EnhancedBookmark, ViewMode } from "../lib/types";
import { getDomain, getFaviconUrl, formatDate } from "../lib/utils";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";

interface BookmarkCardProps {
  bookmark: EnhancedBookmark;
  viewMode: ViewMode;
  onEdit: (bookmark: EnhancedBookmark) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onOpenReader: (bookmark: EnhancedBookmark) => void;
  onCaptureScreenshot: (bookmark: EnhancedBookmark) => void;
  onSelectTag: (tag: string) => void;
}

export function BookmarkCard({
  bookmark,
  viewMode,
  onEdit,
  onDelete,
  onToggleFavorite,
  onOpenReader,
  onCaptureScreenshot,
  onSelectTag,
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

  const thumbnail = bookmark.screenshot || bookmark.ogImage;
  const isCardView = viewMode === "cards";

  return (
    <Card className="pop-3d group h-full flex flex-col justify-between border-border bg-card transition-all">
      <div>
        {/* Visual Snapshot Banner (shown in Cards view) */}
        {isCardView && (
          <div className="relative w-full aspect-video bg-muted/60 border-b border-border overflow-hidden flex items-center justify-center">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={bookmark.title}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground gap-1.5 p-4 text-center">
                <Globe className="w-8 h-8 stroke-1 text-muted-foreground/60" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider">
                  {domain}
                </span>
              </div>
            )}

            {/* Quick action overlay */}
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 p-1 border border-border">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCaptureScreenshot(bookmark);
                }}
                className="p-1 hover:text-primary text-muted-foreground"
                title="Capture / Update Screenshot"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Card Header Content */}
        <div className="p-4 space-y-3">
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
                target="_blank"
                rel="noreferrer"
                className="font-bold text-sm leading-snug tracking-tight text-foreground hover:text-primary transition-colors line-clamp-2"
                title={bookmark.title}
              >
                {bookmark.title}
              </a>
            </div>

            {/* Favorite Star Button */}
            <button
              type="button"
              onClick={() => onToggleFavorite(bookmark.id, !bookmark.isFavorite)}
              className="p-1 text-muted-foreground hover:text-amber-400 transition-colors flex-shrink-0"
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
          className="text-[11px] font-mono text-muted-foreground hover:text-primary font-bold truncate flex items-center gap-1 max-w-[150px]"
          title={bookmark.url}
        >
          <span>{domain}</span>
          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
        </a>

        <div className="flex items-center gap-1">
          {bookmark.readerContent && (
            <button
              onClick={() => onOpenReader(bookmark)}
              className="p-1 hover:text-primary text-muted-foreground"
              title="Read saved article"
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>
          )}

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
