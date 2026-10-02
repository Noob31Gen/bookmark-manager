import { BookmarkMetadata, GitHubConfig, UserPreferences } from "./types";

const METADATA_KEY = "noob31_bookmark_metadata";
const GITHUB_CONFIG_KEY = "noob31_github_config";
const PREFERENCES_KEY = "noob31_user_preferences";
const THEME_KEY = "noob31_theme";

// Default User Preferences
export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  fetchScope: "all",
  skip200OnRefetch: true,
  refetchErrorsOnly: false,
  clickAction: "browse_mode",
  mainViewThumbnail: "auto",
  defaultSort: "date-desc",
  viewMode: "cards",
  concurrencyLimit: 4,
};

// Default GitHub Configuration
export const DEFAULT_GITHUB_CONFIG: GitHubConfig = {
  enabled: false,
  token: "",
  owner: "",
  repo: "",
  branch: "main",
  autoSync: false,
  syncIntervalMinutes: 30,
  syncStatus: "idle",
};

// --- Storage Adapter ---
async function getStorageItem<T>(key: string, defaultValue: T): Promise<T> {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        if (result && result[key] !== undefined) {
          resolve(result[key]);
        } else {
          resolve(defaultValue);
        }
      });
    });
  }

  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

async function setStorageItem<T>(key: string, value: T): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error("Failed to write to localStorage", err);
  }
}

// --- Metadata Operations ---
export async function getAllMetadata(): Promise<Record<string, BookmarkMetadata>> {
  return await getStorageItem<Record<string, BookmarkMetadata>>(METADATA_KEY, {});
}

export async function getBookmarkMetadata(id: string): Promise<BookmarkMetadata> {
  const all = await getAllMetadata();
  return all[id] || {};
}

export async function saveBookmarkMetadata(
  id: string,
  metadata: Partial<BookmarkMetadata>
): Promise<BookmarkMetadata> {
  const all = await getAllMetadata();
  const existing = all[id] || {};
  const updated: BookmarkMetadata = {
    ...existing,
    ...metadata,
    tags: Array.from(new Set([...(metadata.tags || existing.tags || [])])),
  };

  all[id] = updated;
  await setStorageItem(METADATA_KEY, all);
  return updated;
}

export async function deleteBookmarkMetadata(id: string): Promise<void> {
  const all = await getAllMetadata();
  if (all[id]) {
    delete all[id];
    await setStorageItem(METADATA_KEY, all);
  }
}

export async function deleteMultipleBookmarkMetadata(ids: string[]): Promise<void> {
  const all = await getAllMetadata();
  for (const id of ids) {
    if (all[id]) delete all[id];
  }
  await setStorageItem(METADATA_KEY, all);
}

export async function bulkUpdateMetadata(
  updates: Record<string, Partial<BookmarkMetadata>>
): Promise<void> {
  const all = await getAllMetadata();
  for (const [id, meta] of Object.entries(updates)) {
    all[id] = {
      ...(all[id] || {}),
      ...meta,
    };
  }
  await setStorageItem(METADATA_KEY, all);
}

// --- User Preferences Operations ---
export async function getUserPreferences(): Promise<UserPreferences> {
  const saved = await getStorageItem<Partial<UserPreferences>>(PREFERENCES_KEY, {});
  return {
    ...DEFAULT_USER_PREFERENCES,
    ...saved,
  };
}

export async function saveUserPreferences(
  prefs: Partial<UserPreferences>
): Promise<UserPreferences> {
  const current = await getUserPreferences();
  const updated = { ...current, ...prefs };
  await setStorageItem(PREFERENCES_KEY, updated);
  return updated;
}

// --- GitHub Config Operations ---
export async function getGitHubConfig(): Promise<GitHubConfig> {
  return await getStorageItem<GitHubConfig>(GITHUB_CONFIG_KEY, DEFAULT_GITHUB_CONFIG);
}

export async function saveGitHubConfig(config: Partial<GitHubConfig>): Promise<GitHubConfig> {
  const current = await getGitHubConfig();
  const updated = { ...current, ...config };
  await setStorageItem(GITHUB_CONFIG_KEY, updated);
  return updated;
}

// --- Theme Operations ---
export async function getSavedTheme(): Promise<"dark" | "light"> {
  return await getStorageItem<"dark" | "light">(THEME_KEY, "dark");
}

export async function saveTheme(theme: "dark" | "light"): Promise<void> {
  await setStorageItem(THEME_KEY, theme);
}
