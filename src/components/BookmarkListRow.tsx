import { useState } from "react";
import {
  ExternalLink,
  Star,
  Copy,
  Check,
  Edit2,
  Trash2,
  BookOpen,
} from "lucide-react";
import { EnhancedBookmark } from "../lib/types";
import { getDomain, getFaviconUrl, formatDate } from "../lib/utils";

interface BookmarkListRowProps {
  bookmark: EnhancedBookmark;
  onEdit: (bookmark: EnhancedBookmark) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onOpenReader: (bookmark: EnhancedBookmark) => void;
  onSelectTag: (tag: string) => void;
}

export function BookmarkListRow({
  bookmark,
  onEdit,
  onDelete,
  onToggleFavorite,
  onOpenReader,
  onSelectTag,
}: BookmarkListRowProps) {
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

  return (
    <div className="pop-3d group flex items-center justify-between p-3 border border-border bg-card hover:bg-muted/40 transition-colors gap-4">
      {/* Favicon & Title */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
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
            target="_blank"
            rel="noreferrer"
            className="font-bold text-sm text-foreground hover:text-primary transition-colors truncate"
            title={bookmark.title}
          >
            {bookmark.title}
          </a>
          <span className="text-[11px] font-mono text-muted-foreground truncate">
            {domain}
          </span>
        </div>
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
      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
        {bookmark.readerContent && (
          <button
            onClick={() => onOpenReader(bookmark)}
            className="p-1.5 hover:text-primary text-muted-foreground"
            title="Read article"
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={handleCopy}
          className="p-1.5 hover:text-primary text-muted-foreground"
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
          className="p-1.5 hover:text-primary text-muted-foreground"
          title="Edit"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => onDelete(bookmark.id)}
          className="p-1.5 hover:text-destructive text-muted-foreground"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <a
          href={bookmark.url}
          target="_blank"
          rel="noreferrer"
          className="p-1.5 hover:text-primary text-muted-foreground"
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
