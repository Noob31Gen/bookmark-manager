import { CheckCircle2, AlertTriangle, SkipForward, RefreshCw, X } from "lucide-react";
import { BatchFetchProgress } from "../lib/types";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

interface RefetchProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: BatchFetchProgress;
  onCancel: () => void;
}

export function RefetchProgressModal({
  isOpen,
  onClose,
  progress,
  onCancel,
}: RefetchProgressModalProps) {
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={progress.isRunning ? () => {} : onClose}
      title={progress.isRunning ? "Refetching Bookmarks..." : "Refetch Completed"}
      subtitle="Fetching HTTP status, live OpenGraph metadata, and site icons"
      maxWidth="max-w-lg"
    >
      <div className="space-y-6">
        {/* Progress Bar (Sharp, solid, ZERO pulsing) */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-mono font-bold">
            <span className="uppercase text-muted-foreground">Progress</span>
            <span className="text-primary font-extrabold">{percent}% ({progress.current} / {progress.total})</span>
          </div>

          <div className="w-full h-3 bg-muted border border-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Current Active Item */}
        {progress.isRunning && progress.currentTitle && (
          <div className="p-3 bg-muted/40 border border-border space-y-1 text-xs">
            <div className="font-bold text-foreground truncate flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
              <span className="truncate">{progress.currentTitle}</span>
            </div>
            <div className="text-muted-foreground font-mono truncate text-[11px]">
              {progress.currentUrl}
            </div>
          </div>
        )}

        {/* Statistics Grid */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-3 text-center">
          <div className="p-2 sm:p-3 bg-card border border-border">
            <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs font-bold text-green-500 uppercase">
              <CheckCircle2 className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> Healthy
            </div>
            <div className="text-base sm:text-xl font-black font-mono mt-1 text-foreground">
              {progress.successCount}
            </div>
          </div>

          <div className="p-2 sm:p-3 bg-card border border-border">
            <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs font-bold text-destructive uppercase">
              <AlertTriangle className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> Errors
            </div>
            <div className="text-base sm:text-xl font-black font-mono mt-1 text-foreground">
              {progress.errorCount}
            </div>
          </div>

          <div className="p-2 sm:p-3 bg-card border border-border">
            <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs font-bold text-muted-foreground uppercase">
              <SkipForward className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> Skipped
            </div>
            <div className="text-base sm:text-xl font-black font-mono mt-1 text-foreground">
              {progress.skippedCount}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2 border-t border-border">
          {progress.isRunning ? (
            <Button variant="destructive" size="sm" onClick={onCancel} className="font-bold">
              Stop Refetch
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={onClose} className="font-bold">
              Close
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
