import { useState } from "react";
import {
  ExternalLink,
  Copy,
  Check,
  Globe,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Image as ImageIcon,
  Sparkles,
  Camera,
  FileText,
  Tag,
  Calendar,
  Edit2,
  RefreshCw,
  FileArchive,
  Maximize2,
} from "lucide-react";
import { EnhancedBookmark } from "../lib/types";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { HttpStatusBadge } from "./HttpStatusBadge";
import { ArchiveViewerModal, ArchiveViewerTab } from "./ArchiveViewerModal";
import { formatDate, getDomain } from "../lib/utils";
import { formatBytes } from "../lib/archiveStore";

interface BrowseModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmark: EnhancedBookmark | null;
  onEdit: (bookmark: EnhancedBookmark) => void;
  onRefetchSingle: (bookmark: EnhancedBookmark) => Promise<void>;
  onCaptureArchive?: (bookmark: EnhancedBookmark) => Promise<void>;
}

export function BrowseModeModal({
  isOpen,
  onClose,
  bookmark,
  onEdit,
  onRefetchSingle,
  onCaptureArchive,
}: BrowseModeModalProps) {
  const [copied, setCopied] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState<"all" | "screenshot" | "embed" | "page_images">("all");
  const [isRefetching, setIsRefetching] = useState(false);
  const [viewerTab, setViewerTab] = useState<ArchiveViewerTab | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  if (!bookmark) return null;

  const domain = getDomain(bookmark.url);
  const finalDomain = bookmark.finalUrl ? getDomain(bookmark.finalUrl) : null;
  const isRedirected = bookmark.isRedirect || (!!bookmark.finalUrl && bookmark.finalUrl !== bookmark.url);

  const handleCopyUrl = (urlToCopy: string, isRedirectCopy = false) => {
    navigator.clipboard.writeText(urlToCopy);
    if (isRedirectCopy) {
      setCopiedRedirect(true);
      setTimeout(() => setCopiedRedirect(false), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefetch = async () => {
    setIsRefetching(true);
    try {
      await onRefetchSingle(bookmark);
    } finally {
      setIsRefetching(false);
    }
  };

  const handleCaptureArchive = async () => {
    if (!onCaptureArchive) return;
    setIsCapturing(true);
    try {
      await onCaptureArchive(bookmark);
    } finally {
      setIsCapturing(false);
    }
  };

  const archive = bookmark.archive;

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Browse Mode"
      subtitle={`Expanded Inspector • ${domain}`}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4 sm:space-y-6">
        {/* Top Header Card */}
        <div className="border border-border bg-card p-3.5 sm:p-5 space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
            <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0">
              {bookmark.favicon ? (
                <img
                  src={bookmark.favicon}
                  alt=""
                  className="size-6 sm:size-7 object-contain mt-0.5 sm:mt-1 flex-shrink-0 border border-border p-0.5 bg-background"
                />
              ) : (
                <Globe className="size-6 sm:size-7 text-muted-foreground mt-0.5 sm:mt-1 flex-shrink-0" />
              )}
              <div className="space-y-1 min-w-0 flex-1">
                <h1 className="text-base sm:text-xl md:text-2xl font-black text-foreground tracking-tight leading-snug">
                  {bookmark.title}
                </h1>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap text-xs font-mono text-muted-foreground">
                  <span className="font-bold text-primary">{domain}</span>
                  <span>•</span>
                  <span>Added {formatDate(bookmark.dateAdded)}</span>
                  {bookmark.lastChecked && (
                    <>
                      <span>•</span>
                      <span>Checked {formatDate(bookmark.lastChecked)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* HTTP Diagnostics Badge */}
            <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
              <HttpStatusBadge
                status={bookmark.httpStatus}
                statusText={bookmark.httpStatusText}
                className="text-xs px-2.5 py-1"
              />
            </div>
          </div>

          {/* Redirect Alert / Info Banner */}
          {isRedirected && bookmark.finalUrl && (
            <div className="p-2.5 sm:p-3 bg-amber-500/10 border border-amber-500/30 text-xs text-foreground space-y-2">
              <div className="font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                <ArrowRight className="w-4 h-4" /> Redirect Detected (3xx / Final URL)
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-[11px] bg-background/80 p-2 border border-border">
                <div className="truncate flex items-center gap-2">
                  <span className="text-muted-foreground line-through truncate max-w-[150px] sm:max-w-[200px]" title={bookmark.url}>
                    {bookmark.url}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  <span className="text-foreground font-bold truncate" title={bookmark.finalUrl}>
                    {bookmark.finalUrl}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleCopyUrl(bookmark.finalUrl!, true)}
                    className="hover:text-primary text-muted-foreground flex items-center gap-1 cursor-pointer text-xs"
                  >
                    {copiedRedirect ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedRedirect ? "Copied" : "Copy Target"}</span>
                  </button>
                  <a
                    href={bookmark.finalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="pop-3d px-2 py-0.5 bg-primary text-primary-foreground font-bold flex items-center gap-1 text-[10px]"
                  >
                    Open Final <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          {bookmark.description && (
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {bookmark.description}
            </p>
          )}

          {/* Tags */}
          {bookmark.tags && bookmark.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {bookmark.tags.map((tag) => (
                <Badge key={tag} variant="primary">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Action Tools Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={bookmark.url}
                target="_blank"
                rel="noreferrer"
                className="pop-3d inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-primary text-primary-foreground font-bold text-xs border border-primary cursor-pointer"
              >
                Open Page <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyUrl(bookmark.url || "")}
                className="gap-1.5 text-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied Link" : "Copy URL"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRefetch}
                disabled={isRefetching}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-primary ${isRefetching ? "animate-spin" : ""}`} />
                <span>{isRefetching ? "Refetching..." : "Refetch"}</span>
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(bookmark)}
              className="gap-1.5 text-xs"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Metadata</span>
            </Button>
          </div>
        </div>

        {/* Page Archive (Full-page screenshot + MHTML) */}
        <div className="border border-border bg-card p-3.5 sm:p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
              <FileArchive className="w-4 h-4 text-primary" /> Page Archive
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground">
              {archive ? `Captured ${formatDate(archive.capturedAt)}` : "Not archived yet"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              id="browse-view-fullpage"
              onClick={() => setViewerTab("screenshot")}
              disabled={!archive?.fullPageBytes && !bookmark.screenshot}
              className="pop-3d group flex items-center gap-2.5 p-3 border border-border bg-background hover:border-primary text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Camera className="w-5 h-5 text-primary flex-shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase">View Full Page</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">
                  {archive?.fullPageBytes
                    ? `${archive.fullPageWidth}×${archive.fullPageHeight} • ${formatBytes(archive.fullPageBytes)}`
                    : bookmark.screenshot ? "Thumbnail only" : "Unavailable"}
                </div>
              </div>
            </button>
            <button
              id="browse-view-mhtml"
              onClick={() => setViewerTab("mhtml")}
              disabled={!archive?.mhtmlBytes}
              className="pop-3d group flex items-center gap-2.5 p-3 border border-border bg-background hover:border-primary text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText className="w-5 h-5 text-primary flex-shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase">View Web Archive</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">
                  {archive?.mhtmlBytes ? `MHTML • ${formatBytes(archive.mhtmlBytes)}` : "Unavailable"}
                </div>
              </div>
            </button>
            {onCaptureArchive && (
              <button
                id="browse-capture-archive"
                onClick={handleCaptureArchive}
                disabled={isCapturing}
                className="pop-3d group flex items-center gap-2.5 p-3 border border-primary bg-primary text-primary-foreground text-left disabled:opacity-60"
              >
                <RefreshCw className={`w-5 h-5 flex-shrink-0 ${isCapturing ? "animate-spin" : ""}`} />
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase">{isCapturing ? "Capturing..." : archive ? "Recapture" : "Capture Archive"}</div>
                  <div className="text-[10px] font-mono opacity-80 truncate">Full page + MHTML</div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Media & Visual Assets Section */}
        <div className="border border-border bg-card p-3.5 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2 flex-wrap gap-2">
            <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-primary" /> Visual Assets & Fetched Media
            </h3>

            {/* Media Filter Selector (Horizontally scrollable) */}
            <div className="flex items-center border border-border bg-muted/40 p-0.5 text-xs overflow-x-auto no-scrollbar max-w-full">
              <button
                onClick={() => setActiveMediaTab("all")}
                className={`px-2 py-0.5 font-bold uppercase transition-all ${
                  activeMediaTab === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {bookmark.screenshot && (
                <button
                  onClick={() => setActiveMediaTab("screenshot")}
                  className={`px-2 py-0.5 font-bold uppercase transition-all ${
                    activeMediaTab === "screenshot" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Screenshot
                </button>
              )}
              {bookmark.ogImage && (
                <button
                  onClick={() => setActiveMediaTab("embed")}
                  className={`px-2 py-0.5 font-bold uppercase transition-all ${
                    activeMediaTab === "embed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  OG Embed
                </button>
              )}
              {bookmark.fetchedImages && bookmark.fetchedImages.length > 0 && (
                <button
                  onClick={() => setActiveMediaTab("page_images")}
                  className={`px-2 py-0.5 font-bold uppercase transition-all ${
                    activeMediaTab === "page_images" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Page Images ({bookmark.fetchedImages.length})
                </button>
              )}
            </div>
          </div>

          {/* Media Display Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Viewport Screenshot */}
            {(activeMediaTab === "all" || activeMediaTab === "screenshot") && bookmark.screenshot && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold uppercase text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5 text-primary" /> Screenshot
                  </span>
                  <button
                    onClick={() => setViewerTab("screenshot")}
                    className="text-primary hover:underline font-mono text-[10px] inline-flex items-center gap-1"
                  >
                    <Maximize2 className="w-3 h-3" /> {archive?.fullPageBytes ? "Full Page" : "Expand"}
                  </button>
                </div>
                <div className="w-full aspect-video bg-muted border border-border overflow-hidden group">
                  <img
                    src={bookmark.screenshot}
                    alt="Viewport snapshot"
                    className="w-full h-full object-cover object-top hover:scale-105 transition-transform duration-300 cursor-zoom-in"
                    onClick={() => setViewerTab("screenshot")}
                  />
                </div>
              </div>
            )}

            {/* OG Social Embed Image */}
            {(activeMediaTab === "all" || activeMediaTab === "embed") && bookmark.ogImage && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold uppercase text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> OpenGraph Social Embed
                  </span>
                  <a href={bookmark.ogImage} target="_blank" rel="noreferrer" className="text-primary hover:underline font-mono text-[10px]">
                    Full Image
                  </a>
                </div>
                <div className="w-full aspect-video bg-muted border border-border overflow-hidden group">
                  <img
                    src={bookmark.ogImage}
                    alt="OG Embed"
                    className="w-full h-full object-cover object-center hover:scale-105 transition-transform duration-300 cursor-pointer"
                    onClick={() => window.open(bookmark.ogImage, "_blank")}
                  />
                </div>
              </div>
            )}
          </div>

          {/* In-Page Extracted Images Gallery */}
          {(activeMediaTab === "all" || activeMediaTab === "page_images") &&
            bookmark.fetchedImages &&
            bookmark.fetchedImages.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Extracted Page Images ({bookmark.fetchedImages.length})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {bookmark.fetchedImages.map((imgSrc, idx) => (
                    <div
                      key={idx}
                      className="aspect-square bg-muted/60 border border-border overflow-hidden hover:border-primary transition-colors cursor-pointer"
                      onClick={() => window.open(imgSrc, "_blank")}
                      title="Click to view full image"
                    >
                      <img src={imgSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  ))}
                </div>
              </div>
            )}

          {!bookmark.screenshot && !bookmark.ogImage && (!bookmark.fetchedImages || bookmark.fetchedImages.length === 0) && (
            <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border">
              No visual screenshots or embeds fetched yet. Click <strong>Refetch</strong> above to extract media.
            </div>
          )}
        </div>

        {/* Personal Notes Section */}
        {bookmark.notes && (
          <div className="p-4 bg-muted/40 border-l-4 border-primary text-sm leading-relaxed space-y-1">
            <h4 className="font-bold text-xs uppercase tracking-wider text-primary">Personal Notes</h4>
            <p className="whitespace-pre-wrap text-foreground font-mono text-xs">{bookmark.notes}</p>
          </div>
        )}

        {/* Extracted Article / Text Snapshot */}
        {bookmark.readerContent && (
          <div className="border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2 border-b border-border pb-2">
              <FileText className="w-4 h-4 text-primary" /> Extracted Article Content
            </h3>
            <div className="prose dark:prose-invert max-w-none text-foreground/90 leading-relaxed text-sm whitespace-pre-wrap font-serif max-h-96 overflow-y-auto p-2 bg-background/50 border border-border">
              {bookmark.readerContent}
            </div>
          </div>
        )}
      </div>
    </Modal>
    <ArchiveViewerModal
      isOpen={viewerTab !== null}
      onClose={() => setViewerTab(null)}
      bookmark={bookmark}
      initialTab={viewerTab || "screenshot"}
      onRecapture={onCaptureArchive}
    />
    </>
  );
}
