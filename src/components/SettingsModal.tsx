import { useState, useEffect } from "react";
import {
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Download,
  Upload,
  Key,
  FolderGit2,
  RefreshCw,
  Eye,
  EyeOff,
  Database,
  ExternalLink,
} from "lucide-react";
import { GitHubConfig } from "../lib/types";
import { testGitHubConnection, syncVaultToGitHub, pullVaultFromGitHub } from "../lib/githubSync";
import { saveGitHubConfig } from "../lib/metadataStore";
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
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    setFormData(config);
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

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveGitHubConfig({
      ...formData,
      enabled: !!(formData.token && formData.owner && formData.repo),
    });
    onConfigUpdated();
    setSyncFeedback("Settings saved successfully!");
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Vault Settings & GitHub Cloud"
      subtitle="Configure cloud sync, asset storage, and backup options"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-8">
        {/* GitHub Cloud Vault Section */}
        <section className="space-y-4">
          <div className="border-b border-border pb-2 flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-primary" /> GitHub Storage & Asset CDN
            </h3>
            <span className="text-[11px] text-muted-foreground">Serverless Cloud Storage</span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Store your entire bookmark hierarchy, tags, metadata, and live tab screenshots directly
            in a private or public GitHub repository.
          </p>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            {/* Token */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  GitHub Personal Access Token (PAT) *
                </label>
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 font-bold"
                >
                  Create Token <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex gap-2">
                <Input
                  type={showToken ? "text" : "password"}
                  value={formData.token}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                  placeholder="github_pat_..."
                  icon={<Key className="w-4 h-4" />}
                  required
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

            {/* Owner & Repo Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  GitHub Username / Owner *
                </label>
                <Input
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="e.g. Noob31Gen"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Repository Name *
                </label>
                <Input
                  value={formData.repo}
                  onChange={(e) => setFormData({ ...formData, repo: e.target.value })}
                  placeholder="e.g. bookmark-vault"
                  required
                />
              </div>
            </div>

            {/* Branch */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Auto-Sync Interval
                </label>
                <select
                  value={formData.syncIntervalMinutes}
                  onChange={(e) =>
                    setFormData({ ...formData, syncIntervalMinutes: Number(e.target.value) })
                  }
                  className="w-full bg-background border border-input px-3.5 py-2 text-sm text-foreground transition-colors outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value={15}>Every 15 minutes</option>
                  <option value={30}>Every 30 minutes</option>
                  <option value={60}>Every 1 hour</option>
                  <option value={360}>Every 6 hours</option>
                </select>
              </div>
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

            {/* Action buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex gap-2">
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
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isSyncing ? "Pushing..." : "Push Local to GitHub"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleManualPull}
                  disabled={isPulling || !formData.token}
                  className="gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isPulling ? "Pulling..." : "Pull from GitHub"}
                </Button>
              </div>

              <Button type="submit" variant="default" size="sm" className="font-bold">
                Save Settings
              </Button>
            </div>
          </form>
        </section>

        {/* Local Backup & Data Portability */}
        <section className="space-y-4">
          <div className="border-b border-border pb-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> Data Portability & Local Backups
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
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
              variant="outline"
              size="sm"
              onClick={handleExportHTML}
              className="flex-col h-auto py-3 gap-1 text-center"
            >
              <Download className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs">Export HTML Bookmarks</span>
              <span className="text-[10px] text-muted-foreground font-normal">Standard Netscape format</span>
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
      </div>
    </Modal>
  );
}
