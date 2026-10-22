import { useState, useEffect } from "react";
import {
  Bookmark,
  Check,
  Globe,
  Tag,
  Camera,
  Maximize2,
  Folder,
  Layers,
  Settings,
  Sparkles,
} from "lucide-react";
import { EnhancedBookmark, FolderNode } from "../lib/types";
import {
  getEnhancedBookmarkTree,
  extractAllBookmarks,
  extractFolderTree,
  createBookmark,
  updateBookmark,
  deleteBookmark,
} from "../lib/chromeBookmarks";
import { extractActiveTabDetails, captureActiveTabScreenshot, commitPendingArchive } from "../lib/capture";
import { normalizeTag, getDomain } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { ThemeToggle } from "../components/layout/ThemeToggle";

export function PopupApp() {
  const [loading, setLoading] = useState(true);
  const [activeTabInfo, setActiveTabInfo] = useState<{
    title: string;
    url: string;
    description: string;
    favicon?: string;
    ogImage?: string;
    suggestedTags: string[];
    readerText?: string;
  } | null>(null);

  const [existingBookmark, setExistingBookmark] = useState<EnhancedBookmark | null>(null);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState("1");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState("");
  const [screenshot, setScreenshot] = useState<string | undefined>(undefined);
  const [capturing, setCapturing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const tree = await getEnhancedBookmarkTree();
        const all = extractAllBookmarks(tree);
        const folderTree = extractFolderTree(tree);
        setFolders(folderTree);

        const tabData = await extractActiveTabDetails();
        if (tabData && tabData.url) {
          setActiveTabInfo(tabData);
          setTitle(tabData.title);
          setTags(tabData.suggestedTags || []);

          // Check if already bookmarked
          const match = all.find((b) => b.url === tabData.url);
          if (match) {
            setExistingBookmark(match);
            setTitle(match.title);
            setTags(match.tags || []);
            setNotes(match.notes || "");
            setScreenshot(match.screenshot);
            setSelectedFolderId(match.parentId || "1");
          }
        }
      } catch (err) {
        console.error("Popup init error", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleCaptureScreenshot = async () => {
    setCapturing(true);
    try {
      const snap = await captureActiveTabScreenshot();
      if (snap) {
        setScreenshot(snap);
      }
    } catch (err) {
      console.error("Failed to capture screenshot", err);
    } finally {
      setCapturing(false);
    }
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    const clean = normalizeTag(tagInput);
    if (!tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (t: string) => {
    setTags(tags.filter((item) => item !== t));
  };

  const handleSave = async () => {
    if (!activeTabInfo?.url || !title.trim()) return;

    if (existingBookmark) {
      await updateBookmark(existingBookmark.id, {
        title,
        tags,
        notes,
        screenshot,
        description: activeTabInfo.description,
      });
      if (screenshot) await commitPendingArchive(existingBookmark.id, activeTabInfo.url);
    } else {
      const created = await createBookmark({
        parentId: selectedFolderId,
        title,
        url: activeTabInfo.url,
        tags,
        notes,
        screenshot,
        description: activeTabInfo.description,
        ogImage: activeTabInfo.ogImage,
        favicon: activeTabInfo.favicon,
      });
      if (screenshot && created?.id) await commitPendingArchive(created.id, activeTabInfo.url);
    }

    setIsSaved(true);
    setTimeout(() => {
      window.close();
    }, 1200);
  };

  const handleDelete = async () => {
    if (existingBookmark) {
      await deleteBookmark(existingBookmark.id);
      setExistingBookmark(null);
      setIsSaved(false);
    }
  };

  const handleOpenManager = () => {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
    } else {
      window.open("/manager.html", "_blank");
    }
  };

  const handleOpenSidePanel = () => {
    if (typeof chrome !== "undefined" && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.windowId) {
          chrome.sidePanel.open({ windowId: tabs[0].windowId });
          window.close();
        }
      });
    }
  };

  // Flatten folder list
  const folderOptions: { id: string; title: string; depth: number }[] = [];
  function flatten(list: FolderNode[], depth = 0) {
    for (const f of list) {
      folderOptions.push({ id: f.id, title: f.title, depth });
      if (f.children) flatten(f.children, depth + 1);
    }
  }
  flatten(folders);

  return (
    <div className="w-[380px] bg-card text-foreground border-2 border-border p-4 font-sans select-none flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="size-6 bg-primary flex items-center justify-center text-primary-foreground font-black text-xs border border-primary">
            N31
          </div>
          <span className="font-extrabold uppercase text-sm tracking-tight">
            <span className="marker-slanted">Quick</span> Save
          </span>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleOpenSidePanel}
            title="Open Side Panel"
          >
            <Layers className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleOpenManager}
            title="Open Full Manager"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground">Loading active tab...</div>
      ) : isSaved ? (
        <div className="py-10 text-center space-y-2 animate-in fade-in">
          <div className="size-10 bg-primary/20 text-primary border border-primary flex items-center justify-center mx-auto">
            <Check className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-sm uppercase tracking-wide">Saved to Vault!</h3>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active Tab Preview */}
          <div className="p-2.5 bg-muted/40 border border-border space-y-1.5">
            <div className="flex items-center gap-2">
              {activeTabInfo?.favicon ? (
                <img src={activeTabInfo.favicon} alt="" className="w-4 h-4 object-contain" />
              ) : (
                <Globe className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-[11px] font-mono font-bold text-primary truncate">
                {getDomain(activeTabInfo?.url)}
              </span>

              {existingBookmark && (
                <span className="ml-auto text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 border border-primary/40 font-bold uppercase">
                  In Vault
                </span>
              )}
            </div>

            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bookmark Title"
              className="text-xs font-semibold py-1.5"
            />
          </div>

          {/* Folder & Screenshot Action */}
          <div className="flex gap-2">
            <select
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="flex-1 bg-background border border-input px-2.5 py-1.5 text-xs text-foreground transition-colors outline-none focus:border-primary"
            >
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>

            <Button
              variant={screenshot ? "secondary" : "outline"}
              size="sm"
              onClick={handleCaptureScreenshot}
              disabled={capturing}
              className="gap-1 text-xs"
              title="Capture tab screenshot"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{capturing ? "..." : screenshot ? "Recapture" : "Snapshot"}</span>
            </Button>
          </div>

          {/* Screenshot Preview */}
          {screenshot && (
            <div className="w-full h-24 bg-muted border border-border overflow-hidden relative group">
              <img src={screenshot} alt="Captured preview" className="w-full h-full object-cover object-top" />
              <button
                type="button"
                onClick={() => setScreenshot(undefined)}
                className="absolute top-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Remove
              </button>
            </div>
          )}

          {/* Tags */}
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tags..."
                className="text-xs py-1.5"
                icon={<Tag className="w-3.5 h-3.5" />}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
                Add
              </Button>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {tags.map((tag) => (
                  <Badge key={tag} variant="primary" onRemove={() => handleRemoveTag(tag)}>
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Quick Notes */}
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Quick notes or highlights..."
            className="text-xs min-h-[50px] py-1.5"
          />

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
            {existingBookmark ? (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-destructive hover:underline font-bold"
              >
                Delete
              </button>
            ) : (
              <span />
            )}

            <Button variant="default" size="sm" onClick={handleSave} className="font-bold w-full sm:w-auto">
              {existingBookmark ? "Update Bookmark" : "Save Bookmark"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
