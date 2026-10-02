import { Camera, CheckCircle2, AlertTriangle, SkipForward, X, Info } from "lucide-react";
import { BatchFetchProgress } from "../lib/types";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

interface ScreenshotProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: BatchFetchProgress;
  onCancel: () => void;
}

export function ScreenshotProgressModal({
  isOpen,
  onClose,
  progress,
  onCancel,
}: ScreenshotProgressModalProps) {
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={progress.isRunning ? () => {} : onClose}
      title={progress.isRunning ? "Capturing Tab Screenshots..." : "Batch Capture Completed"}
      subtitle="Loading webpage tabs sequentially to capture high-definition snapshots"
      maxWidth="max-w-lg"
    >
      <div className="space-y-6">
        {/* Progress Bar (Sharp, solid, ZERO pulsing) */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs font-mono font-bold">
            <span className="uppercase text-muted-foreground">Progress</span>
            <span className="text-primary font-extrabold">
              {percent}% ({progress.current} / {progress.total})
            </span>
          </div>

          <div className="w-full h-3 bg-muted border border-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Live Active Item */}
        {progress.isRunning && progress.currentTitle && (
          <div className="p-3 bg-muted/40 border border-border space-y-1.5 text-xs">
            <div className="font-bold text-foreground truncate flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-primary" />
              <span className="truncate">{progress.currentTitle}</span>
            </div>
            <div className="text-muted-foreground font-mono truncate text-[11px]">
              {progress.currentUrl}
            </div>
          </div>
        )}

        {/* Notice Info Box */}
        {progress.isRunning && (
          <div className="p-2.5 bg-primary/5 border border-primary/30 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Chrome will briefly open each tab in the foreground, wait for images and fonts to render, take a snapshot, and close it before returning here.
            </p>
          </div>
        )}

        {/* Statistics Grid */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-3 text-center">
          <div className="p-2 sm:p-3 bg-card border border-border">
            <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs font-bold text-green-500 uppercase">
              <CheckCircle2 className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> Captured
            </div>
            <div className="text-base sm:text-xl font-black font-mono mt-1 text-foreground">
              {progress.successCount}
            </div>
          </div>

          <div className="p-2 sm:p-3 bg-card border border-border">
            <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs font-bold text-destructive uppercase">
              <AlertTriangle className="w-3 sm:w-3.5 h-3 sm:h-3.5" /> Failed
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

        {/* Action Buttons */}
        <div className="flex justify-end pt-2 border-t border-border">
          {progress.isRunning ? (
            <Button variant="destructive" size="sm" onClick={onCancel} className="font-bold">
              Stop Capture
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={onClose} className="font-bold">
              Done
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
