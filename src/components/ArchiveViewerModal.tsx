import { useEffect, useRef, useState } from "react";
import {
  X,
  Camera,
  FileArchive,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ArrowUp,
} from "lucide-react";
import { EnhancedBookmark } from "../lib/types";
import { getArchive, formatBytes, PageArchive } from "../lib/archiveStore";
import { renderMhtml, RenderedMhtml } from "../lib/mhtml";
import { getDomain, formatDate } from "../lib/utils";

export type ArchiveViewerTab = "screenshot" | "mhtml";

interface ArchiveViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmark: EnhancedBookmark | null;
  initialTab?: ArchiveViewerTab;
  onRecapture?: (bookmark: EnhancedBookmark) => Promise<void>;
}

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];

function safeFileName(s: string) {
  return (s || "page").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80).trim() || "page";
}

export function ArchiveViewerModal({ isOpen, onClose, bookmark, initialTab = "screenshot", onRecapture }: ArchiveViewerModalProps) {
  const [tab, setTab] = useState<ArchiveViewerTab>(initialTab);
  const [archive, setArchive] = useState<PageArchive | undefined>();
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>();
  const [mhtmlUrl, setMhtmlUrl] = useState<string>();
  const [rendered, setRendered] = useState<RenderedMhtml>();
  const [mhtmlState, setMhtmlState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mhtmlError, setMhtmlError] = useState<string>();
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [recapturing, setRecapturing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load archive blobs from IndexedDB
  useEffect(() => {
    if (!isOpen || !bookmark) return;
    let cancelled = false;
    setTab(initialTab);
    setZoom("fit");
    setLoading(true);
    getArchive(bookmark.id).then((a) => {
      if (cancelled) return;
      setArchive(a);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, bookmark?.id, bookmark?.archive?.capturedAt, initialTab, reloadKey]);

  // Object URLs for image + raw mhtml download
  useEffect(() => {
    const img = archive?.fullPage ? URL.createObjectURL(archive.fullPage) : undefined;
    const mh = archive?.mhtml ? URL.createObjectURL(new Blob([archive.mhtml], { type: "multipart/related" })) : undefined;
    setImageUrl(img);
    setMhtmlUrl(mh);
    return () => {
      if (img) URL.revokeObjectURL(img);
      if (mh) URL.revokeObjectURL(mh);
    };
  }, [archive]);

  // Lazily decode MHTML only when its tab is opened
  useEffect(() => {
    if (tab !== "mhtml" || !archive?.mhtml) return;
    let cancelled = false;
    let result: RenderedMhtml | undefined;
    setMhtmlState("loading");
    renderMhtml(archive.mhtml)
      .then((r) => {
        result = r;
        if (cancelled) return r.revoke();
        setRendered(r);
        setMhtmlState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setMhtmlError(err?.message || String(err));
        setMhtmlState("error");
      });
    return () => {
      cancelled = true;
      result?.revoke();
      setRendered(undefined);
      setMhtmlState("idle");
    };
  }, [tab, archive]);

  // Escape closes only this viewer (capture phase so parent modals don't also close)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen, onClose]);

  if (!isOpen || !bookmark) return null;

  const fallbackThumb = !imageUrl ? bookmark.screenshot : undefined;
  const displayImage = imageUrl || fallbackThumb;
  const baseName = safeFileName(bookmark.title || getDomain(bookmark.url));
  const imgExt = archive?.fullPage?.type === "image/jpeg" ? "jpg" : "webp";

  const zoomIndex = zoom === "fit" ? -1 : ZOOM_STEPS.indexOf(zoom);
  const stepZoom = (dir: 1 | -1) => {
    if (zoom === "fit") return setZoom(dir > 0 ? 1 : 0.5);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, zoomIndex + dir))];
    setZoom(next);
  };

  const handleRecapture = async () => {
    if (!onRecapture) return;
    setRecapturing(true);
    try {
      await onRecapture(bookmark);
      setReloadKey((k) => k + 1);
    } finally {
      setRecapturing(false);
    }
  };

  const tabBtn = (id: ArchiveViewerTab, label: string, Icon: typeof Camera, meta?: string, disabled?: boolean) => (
    <button
      id={`archive-tab-${id}`}
      onClick={() => setTab(id)}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border ${
        tab === id
          ? "bg-primary text-primary-foreground border-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {meta && <span className="font-mono text-[10px] opacity-75 normal-case">{meta}</span>}
    </button>
  );

  const toolBtn = "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold border border-border bg-card hover:border-primary hover:text-primary transition-colors";

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2.5 border-b border-border bg-card/95">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm sm:text-base font-black uppercase tracking-wide text-foreground truncate">{bookmark.title}</h2>
          <p className="text-[11px] text-muted-foreground font-mono truncate">
            {getDomain(bookmark.url)}
            {archive && <> • Archived {formatDate(archive.capturedAt)}</>}
          </p>
        </div>

        <div className="flex items-center gap-1 border border-border bg-muted/40 p-0.5 order-3 sm:order-none w-full sm:w-auto overflow-x-auto no-scrollbar">
          {tabBtn("screenshot", "Full Page", Camera, archive?.fullPage ? formatBytes(archive.fullPage.size) : undefined)}
          {tabBtn("mhtml", "Web Archive", FileArchive, archive?.mhtml ? formatBytes(archive.mhtml.size) : undefined, !archive?.mhtml)}
        </div>

        <div className="flex items-center gap-1.5">
          {onRecapture && (
            <button id="archive-recapture" onClick={handleRecapture} disabled={recapturing} className={toolBtn} title="Capture a fresh full-page screenshot + MHTML">
              <RefreshCw className={`w-3.5 h-3.5 ${recapturing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{recapturing ? "Capturing..." : "Recapture"}</span>
            </button>
          )}
          <button id="archive-close" onClick={onClose} className={toolBtn} aria-label="Close viewer">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2 border-b border-border bg-card/80 text-xs">
        {tab === "screenshot" ? (
          <>
            <div className="flex items-center gap-1.5">
              <button id="archive-zoom-out" onClick={() => stepZoom(-1)} className={toolBtn} disabled={!displayImage} title="Zoom out">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button id="archive-zoom-fit" onClick={() => setZoom("fit")} className={`${toolBtn} ${zoom === "fit" ? "border-primary text-primary" : ""}`} title="Fit to width">
                <Maximize2 className="w-3.5 h-3.5" /> Fit
              </button>
              <span className="font-mono w-12 text-center text-muted-foreground">{zoom === "fit" ? "fit" : `${Math.round(zoom * 100)}%`}</span>
              <button id="archive-zoom-in" onClick={() => stepZoom(1)} className={toolBtn} disabled={!displayImage} title="Zoom in">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              {archive?.fullPageWidth && (
                <span className="hidden md:inline font-mono text-muted-foreground ml-2">
                  {archive.fullPageWidth} × {archive.fullPageHeight}px
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button id="archive-scroll-top" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} className={toolBtn} title="Back to top">
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              {displayImage && (
                <a id="archive-open-image" href={displayImage} target="_blank" rel="noreferrer" className={toolBtn} onClick={(e) => fallbackThumb && e.preventDefault()} hidden={!!fallbackThumb}>
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </a>
              )}
              {displayImage && (
                <a id="archive-download-image" href={displayImage} download={`${baseName}.${imageUrl ? imgExt : "webp"}`} className={toolBtn}>
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-muted-foreground font-mono truncate min-w-0 flex-1">
              {mhtmlState === "ready" && rendered
                ? `${rendered.resourceCount} resources • ${rendered.snapshotUrl || bookmark.url}`
                : "Offline snapshot rendered from MHTML (scripts disabled)"}
            </div>
            {mhtmlUrl && (
              <a id="archive-download-mhtml" href={mhtmlUrl} download={`${baseName}.mhtml`} className={toolBtn} title="Download .mhtml — opens natively in Chrome/Edge">
                <Download className="w-3.5 h-3.5" /> Download .mhtml
              </a>
            )}
          </>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-primary" /> Loading archive...
          </div>
        ) : tab === "screenshot" ? (
          <div ref={scrollRef} className="absolute inset-0 overflow-auto">
            {displayImage ? (
              <div className="min-h-full flex flex-col items-center p-3 sm:p-6">
                {fallbackThumb && (
                  <div className="mb-3 flex items-center gap-2 text-xs text-amber-500 border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Only a viewport thumbnail exists. Recapture to get a full-page, high-res screenshot.
                  </div>
                )}
                <img
                  src={displayImage}
                  alt={`Full page screenshot of ${bookmark.title}`}
                  draggable={false}
                  onClick={() => setZoom(zoom === "fit" ? 1 : "fit")}
                  className={`shadow-2xl border border-border bg-white select-none ${zoom === "fit" ? "w-full max-w-6xl cursor-zoom-in" : "max-w-none cursor-zoom-out"}`}
                  style={zoom === "fit" ? undefined : { width: `${(archive?.fullPageWidth || 1600) * zoom}px` }}
                />
              </div>
            ) : (
              <EmptyState text="No screenshot captured yet." onRecapture={onRecapture ? handleRecapture : undefined} busy={recapturing} />
            )}
          </div>
        ) : !archive?.mhtml ? (
          <EmptyState text="No MHTML web archive captured yet." onRecapture={onRecapture ? handleRecapture : undefined} busy={recapturing} />
        ) : mhtmlState === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground p-6 text-center">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            <p>Could not render this archive in-app: {mhtmlError}</p>
            <p className="text-xs">Use “Download .mhtml” and open it in Chrome to view it natively.</p>
          </div>
        ) : mhtmlState !== "ready" || !rendered ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground gap-2 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-primary" /> Decoding web archive...
          </div>
        ) : (
          <iframe
            id="archive-mhtml-frame"
            key={rendered.mainUrl}
            src={rendered.mainUrl}
            title={`Web archive of ${bookmark.title}`}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            className="absolute inset-0 w-full h-full bg-white border-0"
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({ text, onRecapture, busy }: { text: string; onRecapture?: () => void; busy?: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <FileArchive className="w-8 h-8 opacity-50" />
      <p>{text}</p>
      {onRecapture && (
        <button
          onClick={onRecapture}
          disabled={busy}
          className="pop-3d inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-bold text-xs border border-primary"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> {busy ? "Capturing..." : "Capture now"}
        </button>
      )}
    </div>
  );
}
