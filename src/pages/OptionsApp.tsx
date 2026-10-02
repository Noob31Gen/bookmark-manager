import { useState, useEffect } from "react";
import { GitHubConfig } from "../lib/types";
import { getGitHubConfig, DEFAULT_GITHUB_CONFIG } from "../lib/metadataStore";
import { SettingsModal } from "../components/SettingsModal";
import { getEnhancedBookmarkTree, extractAllBookmarks } from "../lib/chromeBookmarks";

export function OptionsApp() {
  const [config, setConfig] = useState<GitHubConfig>(DEFAULT_GITHUB_CONFIG);
  const [totalBookmarks, setTotalBookmarks] = useState(0);

  const load = async () => {
    const gh = await getGitHubConfig();
    setConfig(gh);
    const tree = await getEnhancedBookmarkTree();
    setTotalBookmarks(extractAllBookmarks(tree).length);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <SettingsModal
        isOpen={true}
        onClose={() => {
          if (typeof window !== "undefined") window.close();
        }}
        config={config}
        onConfigUpdated={load}
        totalBookmarks={totalBookmarks}
      />
    </div>
  );
}
