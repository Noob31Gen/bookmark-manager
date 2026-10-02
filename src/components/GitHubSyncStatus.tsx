import { useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
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
    if (!config.token?.trim() || !config.owner?.trim() || !config.repo?.trim()) {
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
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  if (!config.token?.trim() || !config.owner?.trim() || !config.repo?.trim()) {
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

  const tooltipText = `Repository: ${config.owner}/${config.repo}\nLast synced: ${
    config.lastSyncTime ? `${formatTimeAgo(config.lastSyncTime)} (${new Date(config.lastSyncTime).toLocaleString()})` : "Never"
  }`;

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSyncNow}
        disabled={isSyncing}
        className="gap-1.5 font-bold"
        title={tooltipText}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-primary" : "text-primary"}`} />
        <span className="hidden sm:inline">
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
