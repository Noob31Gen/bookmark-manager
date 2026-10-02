import { ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { EnhancedBookmark } from "../lib/types";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { formatDate } from "../lib/utils";

interface ReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmark: EnhancedBookmark | null;
}

export function ReaderModal({ isOpen, onClose, bookmark }: ReaderModalProps) {
  const [copied, setCopied] = useState(false);

  if (!bookmark) return null;

  const handleCopyText = () => {
    if (bookmark.readerContent) {
      navigator.clipboard.writeText(bookmark.readerContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reader Mode"
      subtitle={bookmark.title}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-6">
        {/* Article Meta Header */}
        <div className="border-b border-border pb-4 space-y-2">
          <h1 className="text-2xl font-black tracking-tight text-foreground leading-snug">
            {bookmark.title}
          </h1>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-muted-foreground">
            <span>Saved {formatDate(bookmark.dateAdded)}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyText}
                className="gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy Text"}
              </Button>
              <a
                href={bookmark.url}
                target="_blank"
                rel="noreferrer"
                className="pop-3d inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-bold text-xs border border-primary"
              >
                Original Page <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Snapshot Banner if available */}
        {bookmark.screenshot && (
          <div className="w-full aspect-video max-h-72 overflow-hidden border border-border bg-muted/40">
            <img
              src={bookmark.screenshot}
              alt=""
              className="w-full h-full object-cover object-top"
            />
          </div>
        )}

        {/* Notes if present */}
        {bookmark.notes && (
          <div className="p-4 bg-muted/40 border-l-4 border-primary text-sm leading-relaxed space-y-1">
            <h4 className="font-bold text-xs uppercase tracking-wider text-primary">Notes</h4>
            <p className="whitespace-pre-wrap">{bookmark.notes}</p>
          </div>
        )}

        {/* Article Body Content */}
        <div className="prose dark:prose-invert max-w-none text-foreground/90 leading-relaxed space-y-4 whitespace-pre-wrap text-base font-serif">
          {bookmark.readerContent || (
            <p className="text-muted-foreground italic font-sans">
              {bookmark.description || "No full-text article snapshot captured for this bookmark."}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
