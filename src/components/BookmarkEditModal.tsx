import { useState, useEffect } from "react";
import { Folder, Tag, Star, Camera, Trash, Globe, Image as ImageIcon } from "lucide-react";
import { EnhancedBookmark, FolderNode } from "../lib/types";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input, Textarea } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { normalizeTag } from "../lib/utils";

interface BookmarkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmark: EnhancedBookmark | null;
  folders: FolderNode[];
  onSave: (updated: {
    id?: string;
    parentId?: string;
    title: string;
    url: string;
    tags: string[];
    description?: string;
    notes?: string;
    screenshot?: string;
    isFavorite?: boolean;
  }) => Promise<void>;
}

export function BookmarkEditModal({
  isOpen,
  onClose,
  bookmark,
  folders,
  onSave,
}: BookmarkEditModalProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [parentId, setParentId] = useState("1");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [screenshot, setScreenshot] = useState<string | undefined>(undefined);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (bookmark) {
      setTitle(bookmark.title || "");
      setUrl(bookmark.url || "");
      setParentId(bookmark.parentId || "1");
      setTags(bookmark.tags || []);
      setDescription(bookmark.description || "");
      setNotes(bookmark.notes || "");
      setScreenshot(bookmark.screenshot);
      setIsFavorite(bookmark.isFavorite || false);
    } else {
      setTitle("");
      setUrl("");
      setParentId("1");
      setTags([]);
      setDescription("");
      setNotes("");
      setScreenshot(undefined);
      setIsFavorite(false);
    }
  }, [bookmark, isOpen]);

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    const clean = normalizeTag(tagInput);
    if (!tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setTagInput("");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        id: bookmark?.id,
        parentId,
        title,
        url,
        tags,
        description,
        notes,
        screenshot,
        isFavorite,
      });
      onClose();
    } catch (err) {
      console.error("Failed to save bookmark", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Flatten folder list for dropdown
  const folderOptions: { id: string; title: string; depth: number }[] = [];
  function flatten(list: FolderNode[], depth = 0) {
    for (const f of list) {
      folderOptions.push({ id: f.id, title: f.title, depth });
      if (f.children) flatten(f.children, depth + 1);
    }
  }
  flatten(folders);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={bookmark ? "Edit Bookmark" : "New Bookmark"}
      subtitle={bookmark ? `ID: ${bookmark.id} • Chrome Synced` : "Add directly to Chrome bookmarks"}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Title *
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. GitHub: Where the world builds software"
            required
          />
        </div>

        {/* URL */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            URL *
          </label>
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            icon={<Globe className="w-4 h-4" />}
            required
          />
        </div>

        {/* Folder Selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Chrome Folder
          </label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full bg-background border border-input px-3.5 py-2 text-sm text-foreground transition-colors outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {folderOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {"—".repeat(f.depth)} {f.title}
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Tags
          </label>
          <div className="flex gap-2 mb-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="Add tag and press Enter..."
              icon={<Tag className="w-4 h-4" />}
            />
            <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 bg-muted/40 border border-border">
              {tags.map((tag) => (
                <Badge key={tag} variant="primary" onRemove={() => handleRemoveTag(tag)}>
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Description
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief summary or meta description of the page..."
            rows={2}
          />
        </div>

        {/* Personal Notes */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Personal Notes & Commentary
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Write markdown notes, reasons for bookmarking, code snippets..."
            rows={3}
          />
        </div>

        {/* Screenshot / Snapshot Preview */}
        {screenshot && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> Attached Snapshot
              </label>
              <button
                type="button"
                onClick={() => setScreenshot(undefined)}
                className="text-xs text-destructive hover:underline font-bold"
              >
                Remove Snapshot
              </button>
            </div>
            <div className="w-full h-36 bg-muted/60 border border-border overflow-hidden">
              <img
                src={screenshot}
                alt="Snapshot preview"
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
        )}

        {/* Favorite checkbox */}
        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="favorite-toggle"
            checked={isFavorite}
            onChange={(e) => setIsFavorite(e.target.checked)}
            className="size-4 accent-amber-500 cursor-pointer"
          />
          <label
            htmlFor="favorite-toggle"
            className="text-xs font-bold uppercase tracking-wider text-foreground cursor-pointer flex items-center gap-1.5 select-none"
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite ? "text-amber-500 fill-amber-500" : ""}`} />
            Pin to Starred Bookmarks
          </label>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-4 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving} className="justify-center">
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={isSaving} className="font-bold justify-center">
            {isSaving ? "Saving..." : bookmark ? "Save Changes" : "Create Bookmark"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
