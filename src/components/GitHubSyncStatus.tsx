import { useState } from "react";
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "./ui/Button";
import { GitHubConfig } from "../lib/types";
import { syncVaultToGitHub } from "../lib/githubSync";
import { formatTimeAgo } from "../lib/utils";

interface GitHubSyncStatusProps {
  config: GitHubConfig;
  onConfigChange: () => void;
  onOpenSettings: () => void;
}

export function GitHubSyncStatus({
  config,
  onConfigChange,
  onOpenSettings,
}: GitHubSyncStatusProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSyncNow = async () => {
    if (!config.enabled || !config.token) {
      onOpenSettings();
      return;
    }

    setIsSyncing(true);
    setFeedback(null);
    try {
      const result = await syncVaultToGitHub(config);
      if (result.success) {
        setFeedback("Synced!");
      } else {
        setFeedback(result.message);
      }
      onConfigChange();
    } catch (err: any) {
      setFeedback(err.message || "Sync failed");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  if (!config.enabled || !config.token) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenSettings}
        className="text-muted-foreground hover:text-primary gap-1.5"
        title="Click to connect GitHub Cloud Vault"
      >
        <CloudOff className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="hidden sm:inline">Connect GitHub</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="hidden md:flex flex-col text-right text-[11px] leading-tight cursor-pointer"
        onClick={onOpenSettings}
        title={`Repository: ${config.owner}/${config.repo}\nLast synced: ${config.lastSyncTime ? new Date(config.lastSyncTime).toLocaleString() : "Never"}`}
      >
        <span className="font-semibold text-foreground flex items-center gap-1 justify-end">
          {config.syncStatus === "error" ? (
            <span className="text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Sync Failed
            </span>
          ) : (
            <span className="text-primary flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Vault Synced
            </span>
          )}
        </span>
        <span className="text-muted-foreground">
          {config.lastSyncTime ? formatTimeAgo(config.lastSyncTime) : "Not yet synced"}
        </span>
      </div>

      <Button
        variant={config.syncStatus === "error" ? "destructive" : "outline"}
        size="sm"
        onClick={handleSyncNow}
        disabled={isSyncing}
        className="gap-1.5"
        title="Sync bookmarks & screenshots with GitHub"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-primary" : ""}`} />
        <span className="hidden sm:inline font-bold">
          {isSyncing ? "Syncing..." : "Sync Vault"}
        </span>
      </Button>

      {feedback && (
        <span className="text-xs font-semibold text-primary animate-in fade-in">
          {feedback}
        </span>
      )}
    </div>
  );
}
