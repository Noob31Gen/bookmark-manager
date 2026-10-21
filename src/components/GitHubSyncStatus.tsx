import { useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
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

  const isConfigured = !!(config.token?.trim() && config.owner?.trim() && config.repo?.trim());

  const handleSyncNow = async () => {
    if (!isConfigured) {
      onOpenSettings();
      return;
    }

    setIsSyncing(true);
    setFeedback(null);
    try {
      const result = await syncVaultToGitHub(config, (progress) => setFeedback(progress.message));
      setFeedback(result.message);
      onConfigChange();
    } catch (err: any) {
      setFeedback(err.message || "Sync failed");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setFeedback(null), 8000);
    }
  };

  if (!isConfigured) {
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

  const isError = config.syncStatus === "error" || !!config.lastSyncError;
  const tooltipText = `Repository: ${config.owner}/${config.repo}\nBranch: ${config.branch || "main"}\nStatus: ${
    isError ? `Error (${config.lastSyncError || "Failed"})` : "Connected"
  }\nLast synced: ${
    config.lastSyncTime ? `${formatTimeAgo(config.lastSyncTime)} (${new Date(config.lastSyncTime).toLocaleString()})` : "Never"
  }`;

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSyncNow}
        disabled={isSyncing}
        className={`gap-1.5 font-bold ${isError ? "border-destructive/60 text-destructive hover:bg-destructive/10" : ""}`}
        title={tooltipText}
      >
        {isSyncing ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
        ) : isError ? (
          <AlertCircle className="w-3.5 h-3.5 text-destructive" />
        ) : (
          <Cloud className="w-3.5 h-3.5 text-primary" />
        )}
        <span className="hidden sm:inline">
          {isSyncing ? "Syncing..." : isError ? "Sync Error" : "Sync Vault"}
        </span>
      </Button>

      {feedback && (
        <span
          title={feedback}
          className={`text-xs font-semibold max-w-[260px] truncate animate-in fade-in ${isError ? "text-destructive" : "text-primary"}`}
        >
          {feedback}
        </span>
      )}
    </div>
  );
}
