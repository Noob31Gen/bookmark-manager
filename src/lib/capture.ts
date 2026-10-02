import { ExtractedPageData } from "./types";
import { normalizeTag } from "./utils";

const isChrome = typeof chrome !== "undefined" && !!chrome.tabs;

// Resize and compress base64 image data URL
export async function compressImageDataUrl(
  dataUrl: string,
  maxWidth = 720,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/webp", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Capture screenshot of current active tab
export async function captureActiveTabScreenshot(): Promise<string | undefined> {
  if (!isChrome || !chrome.tabs?.captureVisibleTab) {
    return undefined;
  }

  try {
    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      chrome.tabs.captureVisibleTab(
        undefined as any,
        { format: "png" },
        (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            reject(chrome.runtime.lastError || new Error("Failed to capture tab"));
          } else {
            resolve(dataUrl);
          }
        }
      );
    });

    return await compressImageDataUrl(rawDataUrl);
  } catch (err) {
    console.warn("Could not capture screenshot of active tab:", err);
    return undefined;
  }
}

// Capture live screenshot for a specific bookmark URL
// If the tab is already open, it captures that tab; otherwise it opens a tab, waits for load, takes snapshot, and restores focus
export async function captureBookmarkUrlScreenshot(url: string): Promise<string | undefined> {
  if (!isChrome || !chrome.tabs) return undefined;
  if (!url || !url.startsWith("http")) return undefined;

  try {
    // 1. Check if the user already has a tab open with this bookmark's URL
    const allTabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({}, (tabs) => resolve(tabs || []));
    });

    const targetDomain = new URL(url).hostname;
    const existingTab = allTabs.find(
      (t) => t.url && (t.url === url || (t.url.includes(targetDomain) && !t.url.startsWith("chrome://")))
    );

    const [currentTab] = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs || []));
    });

    if (existingTab && existingTab.id && existingTab.windowId !== undefined) {
      // Temporarily activate existing tab to take the snapshot
      await new Promise<void>((resolve) => {
        chrome.tabs.update(existingTab.id!, { active: true }, () => resolve());
      });
      await new Promise((r) => setTimeout(r, 600)); // allow render settle

      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        chrome.tabs.captureVisibleTab(existingTab.windowId, { format: "png" }, (data) => {
          if (chrome.runtime.lastError || !data) {
            reject(chrome.runtime.lastError || new Error("Capture failed"));
          } else {
            resolve(data);
          }
        });
      });

      // Restore focus to original manager tab
      if (currentTab?.id) {
        chrome.tabs.update(currentTab.id, { active: true });
      }

      return await compressImageDataUrl(rawDataUrl);
    }

    // 2. Open a temporary background/visible tab to load the bookmark's actual page
    const newTab = await new Promise<chrome.tabs.Tab>((resolve) => {
      chrome.tabs.create({ url, active: true }, (tab) => resolve(tab));
    });

    if (!newTab || !newTab.id || newTab.windowId === undefined) {
      return undefined;
    }

    return new Promise<string | undefined>((resolve) => {
      const timeoutId = setTimeout(async () => {
        chrome.tabs.onUpdated.removeListener(listener);
        try {
          if (newTab.id) chrome.tabs.remove(newTab.id);
          if (currentTab?.id) chrome.tabs.update(currentTab.id, { active: true });
        } catch {}
        resolve(undefined);
      }, 15000); // 15s max timeout

      const listener = async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (tabId === newTab.id && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeoutId);

          // Give dynamic images & web fonts 900ms to render
          await new Promise((r) => setTimeout(r, 900));

          try {
            chrome.tabs.captureVisibleTab(newTab.windowId, { format: "png" }, async (rawDataUrl) => {
              // Clean up: close temporary tab and refocus manager tab
              try {
                if (newTab.id) chrome.tabs.remove(newTab.id);
                if (currentTab?.id) chrome.tabs.update(currentTab.id, { active: true });
              } catch {}

              if (rawDataUrl) {
                const compressed = await compressImageDataUrl(rawDataUrl);
                resolve(compressed);
              } else {
                resolve(undefined);
              }
            });
          } catch {
            try {
              if (newTab.id) chrome.tabs.remove(newTab.id);
              if (currentTab?.id) chrome.tabs.update(currentTab.id, { active: true });
            } catch {}
            resolve(undefined);
          }
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  } catch (err) {
    console.warn("Could not capture bookmark tab snapshot:", err);
    return undefined;
  }
}

// Get metadata and reader text from the current active tab
export async function extractActiveTabDetails(): Promise<ExtractedPageData | null> {
  if (!isChrome) {
    return {
      title: "Noob31 Portfolio & Tools",
      url: "https://noob31.com",
      description: "Personal site and self-hosted tools collection by Noob31.",
      ogImage: "https://noob31.com/images/social.png",
      favicon: "https://noob31.com/images/favicon.png",
      suggestedTags: ["tools", "selfhost", "portfolio", "development"],
    };
  }

  try {
    const [tab] = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs || []));
    });

    if (!tab || !tab.id || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
      return tab ? {
        title: tab.title || "New Tab",
        url: tab.url || "",
        description: "",
        favicon: tab.favIconUrl,
        suggestedTags: [],
      } : null;
    }

    // Try executing script on the active tab to extract meta tags
    let pageMeta: Partial<ExtractedPageData> = {};
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const getMeta = (names: string[]) => {
            for (const name of names) {
              const el = document.querySelector(
                `meta[name='${name}'], meta[property='${name}'], meta[itemprop='${name}']`
              );
              if (el) {
                const content = el.getAttribute("content");
                if (content) return content.trim();
              }
            }
            return "";
          };

          const title =
            getMeta(["og:title", "twitter:title"]) ||
            document.title ||
            "";

          const description =
            getMeta(["description", "og:description", "twitter:description"]) ||
            "";

          const ogImage =
            getMeta(["og:image", "twitter:image", "twitter:image:src"]) ||
            "";

          // Auto-generate suggested tags from meta keywords and headings
          const keywordsMeta = getMeta(["keywords", "news_keywords"]);
          const tags = new Set<string>();

          if (keywordsMeta) {
            keywordsMeta.split(",").forEach((k) => {
              const cleaned = k.trim().toLowerCase();
              if (cleaned.length > 1 && cleaned.length < 25) tags.add(cleaned);
            });
          }

          // Extract headings and category
          const category = getMeta(["article:section", "category", "subject"]);
          if (category) tags.add(category.toLowerCase());

          // Clean main content text for reader view
          let bodyText = "";
          const article = document.querySelector("article") || document.querySelector("main");
          if (article) {
            bodyText = (article as HTMLElement).innerText.slice(0, 5000);
          } else {
            bodyText = document.body.innerText.slice(0, 3000);
          }

          return {
            title,
            description,
            ogImage,
            suggestedTags: Array.from(tags).slice(0, 6),
            readerText: bodyText,
          };
        },
      });

      if (results && results[0]?.result) {
        pageMeta = results[0].result;
      }
    } catch {
      // Scripting might be blocked on some restricted domains
    }

    // Suggested tags fallback from hostname
    const domainTags: string[] = [];
    try {
      const host = new URL(tab.url).hostname.replace(/^www\./, "");
      const parts = host.split(".");
      if (parts[0] && parts[0].length > 2) {
        domainTags.push(normalizeTag(parts[0]));
      }
    } catch {}

    const suggestedTags = Array.from(
      new Set([...(pageMeta.suggestedTags || []), ...domainTags])
    );

    return {
      title: pageMeta.title || tab.title || tab.url,
      url: tab.url,
      description: pageMeta.description || "",
      ogImage: pageMeta.ogImage || undefined,
      favicon: tab.favIconUrl || `https://www.google.com/s2/favicons?domain=${new URL(tab.url).hostname}&sz=64`,
      suggestedTags,
      readerText: pageMeta.readerText,
    };
  } catch (err) {
    console.error("Failed to extract tab details", err);
    return null;
  }
}
