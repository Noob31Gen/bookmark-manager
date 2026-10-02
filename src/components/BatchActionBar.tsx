import { useState } from "react";
import {
  FolderInput,
  Copy,
  Trash2,
  RefreshCw,
  X,
  CheckSquare,
  Square,
  Layers,
  Camera,
} from "lucide-react";
import { FolderNode } from "../lib/types";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

interface BatchActionBarProps {
  selectedBookmarkCount: number;
  selectedFolderCount: number;
  totalVisibleCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onRefetchSelected: () => void;
  onCaptureSelectedScreenshots?: () => void;
  onMoveSelected: (destinationFolderId: string) => void;
  onCopySelected: (destinationFolderId: string) => void;
  folders: FolderNode[];
}

export function BatchActionBar({
  selectedBookmarkCount,
  selectedFolderCount,
  totalVisibleCount,
  allSelected,
  onToggleSelectAll,
  onClearSelection,
  onDeleteSelected,
  onRefetchSelected,
  onCaptureSelectedScreenshots,
  onMoveSelected,
  onCopySelected,
  folders,
}: BatchActionBarProps) {
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState("1");

  const totalSelected = selectedBookmarkCount + selectedFolderCount;
  if (totalSelected === 0) return null;

  // Flatten folder options
  const folderOptions: { id: string; title: string; depth: number }[] = [];
  function flatten(list: FolderNode[], depth = 0) {
    for (const f of list) {
      folderOptions.push({ id: f.id, title: f.title, depth });
      if (f.children) flatten(f.children, depth + 1);
    }
  }
  flatten(folders);

  return (
    <>
      <div className="fixed bottom-[60px] md:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card border-2 border-primary text-foreground shadow-2xl p-2 sm:px-4 sm:py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 max-w-4xl w-[96%] sm:w-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Selection Status Row */}
        <div className="flex items-center justify-between sm:justify-start gap-2 sm:pr-2 sm:border-r border-border">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleSelectAll}
              className="p-1 hover:text-primary text-muted-foreground flex items-center gap-1.5 text-xs font-bold uppercase cursor-pointer"
              title={allSelected ? "Deselect All" : "Select All Visible"}
            >
              {allSelected ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span className="font-mono text-xs">
                {allSelected ? "All" : "Select All"}
              </span>
            </button>

            <span className="text-[11px] font-mono font-bold bg-primary text-primary-foreground px-2 py-0.5 border border-primary whitespace-nowrap">
              {selectedBookmarkCount > 0 && `${selectedBookmarkCount} Items`}
              {selectedBookmarkCount > 0 && selectedFolderCount > 0 && ", "}
              {selectedFolderCount > 0 && `${selectedFolderCount} Folders`}
            </span>
          </div>

          {/* Mobile Clear Selection button */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClearSelection}
            className="sm:hidden"
            title="Clear Selection (Esc)"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Action Buttons (Horizontally scrollable on mobile) */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMoveModalOpen(true)}
            className="gap-1.5 text-xs font-bold uppercase flex-shrink-0"
            title="Move selected to another folder"
          >
            <FolderInput className="w-3.5 h-3.5 text-primary" />
            <span>Move</span>
          </Button>

          {selectedBookmarkCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCopyModalOpen(true)}
              className="gap-1.5 text-xs font-bold uppercase flex-shrink-0"
              title="Duplicate bookmarks to another folder"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </Button>
          )}

          {selectedBookmarkCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefetchSelected}
              className="gap-1.5 text-xs font-bold uppercase flex-shrink-0"
              title="Refetch metadata and HTTP status for selected"
            >
              <RefreshCw className="w-3.5 h-3.5 text-primary" />
              <span>Refetch</span>
            </Button>
          )}

          {selectedBookmarkCount > 0 && onCaptureSelectedScreenshots && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCaptureSelectedScreenshots}
              className="gap-1.5 text-xs font-bold uppercase flex-shrink-0"
              title="Open temporary tabs and capture snapshots for selected bookmarks"
            >
              <Camera className="w-3.5 h-3.5 text-primary" />
              <span>Snapshots</span>
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={onDeleteSelected}
            className="gap-1.5 text-xs font-bold uppercase flex-shrink-0"
            title="Delete selected bookmarks and folders"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </Button>

          {/* Desktop Clear Selection button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClearSelection}
            className="hidden sm:inline-flex flex-shrink-0"
            title="Clear Selection (Esc)"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Move Destination Modal */}
      <Modal
        isOpen={moveModalOpen}
        onClose={() => setMoveModalOpen(false)}
        title="Move Selected Items"
        subtitle={`Select destination Chrome folder for ${totalSelected} items`}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Destination Folder
            </label>
            <select
              value={targetFolderId}
              onChange={(e) => setTargetFolderId(e.target.value)}
              className="w-full bg-background border border-input px-3.5 py-2 text-sm text-foreground transition-colors outline-none focus:border-primary"
            >
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {"—".repeat(f.depth)} {f.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setMoveModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onMoveSelected(targetFolderId);
                setMoveModalOpen(false);
              }}
              className="font-bold"
            >
              Move {totalSelected} Items
            </Button>
          </div>
        </div>
      </Modal>

      {/* Copy Destination Modal */}
      <Modal
        isOpen={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
        title="Copy Selected Bookmarks"
        subtitle={`Duplicate ${selectedBookmarkCount} bookmarks into folder`}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Destination Folder
            </label>
            <select
              value={targetFolderId}
              onChange={(e) => setTargetFolderId(e.target.value)}
              className="w-full bg-background border border-input px-3.5 py-2 text-sm text-foreground transition-colors outline-none focus:border-primary"
            >
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {"—".repeat(f.depth)} {f.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setCopyModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onCopySelected(targetFolderId);
                setCopyModalOpen(false);
              }}
              className="font-bold"
            >
              Copy Bookmarks
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
