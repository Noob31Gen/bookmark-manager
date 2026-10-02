import { useState, useEffect } from "react";
import {
  FolderGit2,
  Database,
  Download,
  Upload,
  Key,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  MousePointerClick,
  Layout,
  Type,
} from "lucide-react";
import { GitHubConfig, UserPreferences, FetchScope, ClickAction, MainViewThumbnail } from "../lib/types";
import { testGitHubConnection, syncVaultToGitHub, pullVaultFromGitHub } from "../lib/githubSync";
import { saveGitHubConfig, getUserPreferences, saveUserPreferences } from "../lib/metadataStore";
import {
  getEnhancedBookmarkTree,
  extractAllBookmarks,
  syncAllFetchedTitlesToChrome,
} from "../lib/chromeBookmarks";
import {
  exportVaultAsJSON,
  exportBookmarksAsNetscapeHTML,
  importVaultFromJSON,
  triggerFileDownload,
} from "../lib/exportImport";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GitHubConfig;
  onConfigUpdated: () => void;
  totalBookmarks: number;
}

export function SettingsModal({
  isOpen,
  onClose,
  config,
  onConfigUpdated,
  totalBookmarks,
}: SettingsModalProps) {
  const [formData, setFormData] = useState<GitHubConfig>(config);
  const [preferences, setPreferences] = useState<UserPreferences>({
    fetchScope: "all",
    skip200OnRefetch: true,
    refetchErrorsOnly: false,
    autoUpdateChromeBookmarkTitles: false,
    clickAction: "browse_mode",
    mainViewThumbnail: "auto",
    defaultSort: "date-desc",
    viewMode: "cards",
    concurrencyLimit: 4,
  });

  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isSyncingTitles, setIsSyncingTitles] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    setFormData(config);
    getUserPreferences().then((p) => setPreferences(p));
    setTestResult(null);
    setSyncFeedback(null);
  }, [config, isOpen]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testGitHubConnection(formData);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || "Failed to test connection" });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveGitHubConfig({
      ...formData,
      enabled: !!(formData.token && formData.owner && formData.repo),
    });
    await saveUserPreferences(preferences);
    onConfigUpdated();
    setSyncFeedback("Settings successfully saved!");
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  const handleManualPush = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      await saveGitHubConfig(formData);
      const res = await syncVaultToGitHub(formData);
      setSyncFeedback(res.message);
      onConfigUpdated();
    } catch (err: any) {
      setSyncFeedback(err.message || "Push failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualPull = async () => {
    if (!window.confirm("This will merge metadata & tags from your GitHub repository. Proceed?")) {
      return;
    }
    setIsPulling(true);
    setSyncFeedback(null);
    try {
      const res = await pullVaultFromGitHub(formData);
      setSyncFeedback(res.message);
      onConfigUpdated();
    } catch (err: any) {
      setSyncFeedback(err.message || "Pull failed");
    } finally {
      setIsPulling(false);
    }
  };

  const handleExportJSON = async () => {
    const json = await exportVaultAsJSON();
    triggerFileDownload(`noob31-bookmark-vault-${new Date().toISOString().slice(0, 10)}.json`, json, "application/json");
  };

  const handleExportHTML = async () => {
    const html = await exportBookmarksAsNetscapeHTML();
    triggerFileDownload(`bookmarks-${new Date().toISOString().slice(0, 10)}.html`, html, "text/html");
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        const result = await importVaultFromJSON(text);
        alert(result.message);
        onConfigUpdated();
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSyncAllTitlesNow = async () => {
    setIsSyncingTitles(true);
    setSyncFeedback(null);
    try {
      const allTree = await getEnhancedBookmarkTree();
      const all = extractAllBookmarks(allTree);
      const res = await syncAllFetchedTitlesToChrome(all);
      setSyncFeedback(`Successfully updated ${res.updatedCount} Chrome bookmark titles!`);
      onConfigUpdated();
    } catch (err: any) {
      setSyncFeedback("Failed to update titles: " + (err.message || "Unknown error"));
    } finally {
      setIsSyncingTitles(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Vault Settings & Preferences"
      subtitle="Click actions, thumbnails, refetch rules, and GitHub cloud sync"
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSaveAll} className="space-y-8">
        {/* Interaction & UI Behavior Settings */}
        <section className="space-y-4">
          <div className="border-b border-border pb-2 flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
              <MousePointerClick className="w-4 h-4 text-primary" /> Interaction & Visual Preferences
            </h3>
            <span className="text-[11px] font-mono text-muted-foreground font-bold">UI Behavior</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Click Action Setting */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                On Clicking a Bookmark
              </label>
              <select
                value={preferences.clickAction}
                onChange={(e) =>
                  setPreferences({ ...preferences, clickAction: e.target.value as ClickAction })
                }
                className="w-full bg-background border border-input px-3 py-2 text-xs text-foreground font-bold uppercase outline-none focus:border-primary cursor-pointer"
              >
                <option value="browse_mode">Open Browse Mode (Expanded Inspector)</option>
                <option value="open_link">Open Link Directly in New Tab</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Browse Mode displays full screenshots, OG images, in-page image gallery, and redirect destination.
              </p>
            </div>

            {/* Main View Thumbnail Display Setting */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Main View Thumbnail Display
              </label>
              <select
                value={preferences.mainViewThumbnail}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    mainViewThumbnail: e.target.value as MainViewThumbnail,
                  })
                }
                className="w-full bg-background border border-input px-3 py-2 text-xs text-foreground font-bold uppercase outline-none focus:border-primary cursor-pointer"
              >
                <option value="auto">Auto (Screenshot priority, fallback to OG)</option>
                <option value="embed_only">OG Social Embed Images Only</option>
                <option value="screenshot_only">Viewport Screenshots Only</option>
                <option value="icon_only">Favicon / Site Logo Only</option>
                <option value="none">None (Minimalist No-Banner Cards)</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Controls what image type is prioritized in the main bookmark card view.
              </p>
            </div>
          </div>
        </section>

        {/* Fetcher & Refetch Rules */}
        <section className="space-y-4">
          <div className="border-b border-border pb-2 flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" /> Refetch & Extraction Scope
            </h3>
            <span className="text-[11px] font-mono text-muted-foreground font-bold">Metadata / Diagnostics</span>
          </div>

          <div className="space-y-3">
            {/* Fetch Scope */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Refetch Scope Options
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label
                  className={`pop-3d p-2.5 border cursor-pointer flex flex-col gap-1 transition-all ${
                    preferences.fetchScope === "all"
                      ? "bg-primary/10 border-primary text-foreground font-bold"
                      : "bg-card border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="fetchScope"
                      checked={preferences.fetchScope === "all"}
                      onChange={() => setPreferences({ ...preferences, fetchScope: "all" })}
                      className="accent-primary"
                    />
                    <span className="text-xs font-bold">Full Capture</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Icons, OG Embeds & Page Snapshots
                  </span>
                </label>

                <label
                  className={`pop-3d p-2.5 border cursor-pointer flex flex-col gap-1 transition-all ${
                    preferences.fetchScope === "embeds_only"
                      ? "bg-primary/10 border-primary text-foreground font-bold"
                      : "bg-card border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="fetchScope"
                      checked={preferences.fetchScope === "embeds_only"}
                      onChange={() => setPreferences({ ...preferences, fetchScope: "embeds_only" })}
                      className="accent-primary"
                    />
                    <span className="text-xs font-bold">Icons & Embeds</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Favicons, OG Image & Meta Tags
                  </span>
                </label>

                <label
                  className={`pop-3d p-2.5 border cursor-pointer flex flex-col gap-1 transition-all ${
                    preferences.fetchScope === "screenshots_only"
                      ? "bg-primary/10 border-primary text-foreground font-bold"
                      : "bg-card border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="fetchScope"
                      checked={preferences.fetchScope === "screenshots_only"}
                      onChange={() => setPreferences({ ...preferences, fetchScope: "screenshots_only" })}
                      className="accent-primary"
                    />
                    <span className="text-xs font-bold">Screenshots Only</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Visual Tab Screenshots Only
                  </span>
                </label>
              </div>
            </div>

            {/* Smart Refetch Rule: Errors Only */}
            <div className="p-3 bg-muted/40 border border-border flex items-start gap-3">
              <input
                type="checkbox"
                id="refetch-errors-only-toggle"
                checked={preferences.refetchErrorsOnly}
                onChange={(e) =>
                  setPreferences({ ...preferences, refetchErrorsOnly: e.target.checked })
                }
                className="size-4 mt-0.5 accent-primary cursor-pointer flex-shrink-0"
              />
              <label htmlFor="refetch-errors-only-toggle" className="text-xs cursor-pointer select-none">
                <span className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                  Only refetch bookmarks with errors (4xx / 5xx / Broken)
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  When clicking "Refetch All", only re-query bookmarks that currently have HTTP errors (such as 404, 500, or network timeouts). All healthy and unchecked bookmarks will be skipped.
                </p>
              </label>
            </div>

            {/* Smart Refetch Rule: Skip 200 */}
            <div className="p-3 bg-muted/40 border border-border flex items-start gap-3">
              <input
                type="checkbox"
                id="skip-200-toggle"
                checked={preferences.skip200OnRefetch}
                onChange={(e) =>
                  setPreferences({ ...preferences, skip200OnRefetch: e.target.checked })
                }
                className="size-4 mt-0.5 accent-primary cursor-pointer flex-shrink-0"
              />
              <label htmlFor="skip-200-toggle" className="text-xs cursor-pointer select-none">
                <span className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                  Disable refetch for all bookmarks with HTTP code 200
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  When clicking "Refetch All", healthy bookmarks with code 200 and existing icons will be skipped. Only broken (404/500) or unchecked bookmarks will be refreshed.
                </p>
              </label>
            </div>

            {/* Auto-Update Chrome Bookmark Titles Rule & Instant Sync Action */}
            <div className="p-3 bg-muted/40 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <input
                  type="checkbox"
                  id="auto-update-titles-toggle"
                  checked={preferences.autoUpdateChromeBookmarkTitles}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      autoUpdateChromeBookmarkTitles: e.target.checked,
                    })
                  }
                  className="size-4 mt-0.5 accent-primary cursor-pointer flex-shrink-0"
                />
                <label htmlFor="auto-update-titles-toggle" className="text-xs cursor-pointer select-none">
                  <span className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-primary" />
                    Update Chrome bookmarks with fetched webpage titles
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    When fetching or refetching, automatically update native Chrome bookmark titles with the live title parsed from the page.
                  </p>
                </label>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSyncAllTitlesNow}
                disabled={isSyncingTitles}
                className="font-bold text-xs gap-1.5 flex-shrink-0 whitespace-nowrap self-start sm:self-center"
                title="Immediately push all fetched titles to Chrome bookmarks"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingTitles ? "animate-spin text-primary" : ""}`} />
                <span>{isSyncingTitles ? "Syncing Titles..." : "Sync Titles Now"}</span>
              </Button>
            </div>
          </div>
        </section>

        {/* GitHub Cloud Storage Section */}
        <section className="space-y-4">
          <div className="border-b border-border pb-2 flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-primary" /> GitHub Cloud Storage & Sync
            </h3>
            <span className="text-[11px] font-mono text-muted-foreground font-bold">Git CDN & Vault</span>
          </div>

          <div className="space-y-4">
            {/* Automatic vs Manual Sync Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/30 border border-border">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autosync-toggle"
                  checked={formData.autoSync}
                  onChange={(e) => setFormData({ ...formData, autoSync: e.target.checked })}
                  className="size-4 accent-primary cursor-pointer"
                />
                <label htmlFor="autosync-toggle" className="text-xs font-bold uppercase tracking-wider cursor-pointer">
                  Enable Automatic Cloud Sync
                </label>
              </div>

              {formData.autoSync && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Interval:</label>
                  <select
                    value={formData.syncIntervalMinutes}
                    onChange={(e) =>
                      setFormData({ ...formData, syncIntervalMinutes: Number(e.target.value) })
                    }
                    className="w-full bg-background border border-input px-2.5 py-1 text-xs text-foreground outline-none focus:border-primary"
                  >
                    <option value={15}>Every 15 min</option>
                    <option value={30}>Every 30 min</option>
                    <option value={60}>Every 1 hour</option>
                    <option value={360}>Every 6 hours</option>
                  </select>
                </div>
              )}
            </div>

            {/* Token */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Personal Access Token (PAT)
                </label>
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 font-bold"
                >
                  Generate Token <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex gap-2">
                <Input
                  type={showToken ? "text" : "password"}
                  value={formData.token}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                  placeholder="github_pat_..."
                  icon={<Key className="w-4 h-4" />}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setShowToken(!showToken)}
                  title={showToken ? "Hide Token" : "Show Token"}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Owner & Repo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  GitHub Username / Owner
                </label>
                <Input
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="e.g. Noob31Gen"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Repository Name
                </label>
                <Input
                  value={formData.repo}
                  onChange={(e) => setFormData({ ...formData, repo: e.target.value })}
                  placeholder="e.g. bookmark-vault"
                />
              </div>
            </div>

            {/* Branch */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Branch
              </label>
              <Input
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                placeholder="main"
              />
            </div>

            {/* Test result feedback */}
            {testResult && (
              <div
                className={`p-3 border text-xs leading-relaxed flex items-center gap-2 ${
                  testResult.ok
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-destructive/15 border-destructive text-destructive"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {syncFeedback && (
              <div className="p-3 bg-muted border border-border text-xs text-foreground flex items-center gap-2 font-mono">
                <RefreshCw className="w-3.5 h-3.5 text-primary" />
                <span>{syncFeedback}</span>
              </div>
            )}

            {/* Manual Sync Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing || !formData.token}
                  className="gap-1.5 font-bold"
                >
                  {testing ? "Testing..." : "Test Connection"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleManualPush}
                  disabled={isSyncing || !formData.token}
                  className="gap-1.5"
                  title="Upload all local bookmarks and screenshots to GitHub"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isSyncing ? "Pushing..." : "Manual Push to GitHub"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleManualPull}
                  disabled={isPulling || !formData.token}
                  className="gap-1.5"
                  title="Download and restore bookmarks from GitHub"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isPulling ? "Pulling..." : "Manual Pull from GitHub"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Data Portability */}
        <section className="space-y-4">
          <div className="border-b border-border pb-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> Data Portability & Local Backups
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportJSON}
              className="flex-col h-auto py-3 gap-1 text-center"
            >
              <Download className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs">Export JSON Vault</span>
              <span className="text-[10px] text-muted-foreground font-normal">Full backup with tags</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportHTML}
              className="flex-col h-auto py-3 gap-1 text-center"
            >
              <Download className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs">Export HTML Bookmarks</span>
              <span className="text-[10px] text-muted-foreground font-normal">Netscape standard</span>
            </Button>

            <label className="pop-3d border border-border bg-background hover:bg-muted p-3 flex flex-col items-center justify-center gap-1 cursor-pointer text-center">
              <Upload className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs text-foreground">Import JSON Vault</span>
              <span className="text-[10px] text-muted-foreground">Restore from file</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </label>
          </div>
        </section>

        {/* Save Footer */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" variant="default" className="font-bold">
            Save All Preferences
          </Button>
        </div>
      </form>
    </Modal>
  );
}
