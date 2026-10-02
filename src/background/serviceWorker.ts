// Manifest V3 Background Service Worker
import { getGitHubConfig, saveGitHubConfig } from "../lib/metadataStore";
import { syncVaultToGitHub } from "../lib/githubSync";
import { createBookmark } from "../lib/chromeBookmarks";

// Set up Context Menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-page-snapshot",
    title: "Save page to Vault with Snapshot",
    contexts: ["page"],
  });

  chrome.contextMenus.create({
    id: "save-link",
    title: "Save link to Bookmark Vault",
    contexts: ["link"],
  });

  chrome.contextMenus.create({
    id: "open-manager",
    title: "Open Bookmark Vault Manager",
    contexts: ["action"],
  });

  // Schedule periodic GitHub sync alarm (default 30 mins)
  chrome.alarms.create("github-vault-sync", {
    periodInMinutes: 30,
  });

  console.log("Noob31 Bookmark Vault service worker initialized.");
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-page-snapshot" && tab?.url) {
    let screenshot: string | undefined;
    try {
      screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    } catch {}

    await createBookmark({
      title: tab.title || tab.url,
      url: tab.url,
      screenshot,
      favicon: tab.favIconUrl,
      tags: ["quick-save"],
    });

    // Notify user via badge or notification
    if (tab.id) {
      chrome.action.setBadgeText({ tabId: tab.id, text: "SAVED" });
      chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#ffd53d" });
      setTimeout(() => {
        if (tab.id) chrome.action.setBadgeText({ tabId: tab.id, text: "" });
      }, 2500);
    }
  }

  if (info.menuItemId === "save-link" && info.linkUrl) {
    await createBookmark({
      title: info.selectionText || info.linkUrl,
      url: info.linkUrl,
      tags: ["link"],
    });
  }

  if (info.menuItemId === "open-manager") {
    chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
  }
});

// Periodic GitHub Sync Alarm Handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "github-vault-sync") {
    const config = await getGitHubConfig();
    if (config.enabled && config.autoSync && config.token && config.owner && config.repo) {
      console.log("Running automatic background GitHub vault sync...");
      await syncVaultToGitHub(config);
    }
  }
});

// Message listener for popup / UI commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "CAPTURE_ACTIVE_TAB") {
    chrome.tabs.captureVisibleTab(
      undefined as any,
      { format: "png" },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, dataUrl });
        }
      }
    );
    return true; // Asynchronous response
  }

  if (message.action === "OPEN_MANAGER") {
    chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "OPEN_SIDEPANEL") {
    if (sender.tab?.windowId && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId });
    }
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "TRIGGER_GITHUB_SYNC") {
    getGitHubConfig().then((config) => {
      syncVaultToGitHub(config).then((res) => {
        sendResponse(res);
      });
    });
    return true;
  }
});
