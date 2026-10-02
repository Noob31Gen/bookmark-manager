import { ExtractedPageData, EnhancedBookmark, BookmarkMetadata, BatchFetchProgress } from "./types";
import { normalizeTag } from "./utils";
import { saveBookmarkMetadata } from "./metadataStore";

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

// Extract live DOM metadata (title, description, ogImage, favicon, reader, tags, in-page images) from a rendered tab
export async function extractTabDomMetadata(tabId: number): Promise<Partial<BookmarkMetadata>> {
  if (!isChrome || !chrome.scripting?.executeScript || !tabId) {
    return {};
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
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

        let ogImage =
          getMeta(["og:image", "twitter:image", "twitter:image:src"]) ||
          "";

        if (ogImage && !ogImage.startsWith("http") && !ogImage.startsWith("data:")) {
          try {
            ogImage = new URL(ogImage, window.location.href).href;
          } catch {}
        }

        // Find high-res favicon from link tags
        let favicon = "";
        const iconLinks = Array.from(
          document.querySelectorAll<HTMLLinkElement>(
            "link[rel~='icon'], link[rel='apple-touch-icon'], link[rel='shortcut icon']"
          )
        );
        for (const link of iconLinks) {
          if (link.href && link.href.startsWith("http")) {
            favicon = link.href;
            break;
          }
        }

        // Auto-generate suggested tags from meta keywords and headings
        const keywordsMeta = getMeta(["keywords", "news_keywords"]);
        const tags = new Set<string>();

        if (keywordsMeta) {
          keywordsMeta.split(",").forEach((k) => {
            const cleaned = k.trim().toLowerCase();
            if (cleaned.length > 1 && cleaned.length < 25) tags.add(cleaned);
          });
        }

        const category = getMeta(["article:section", "category", "subject"]);
        if (category) tags.add(category.toLowerCase());

        // Extract reader text
        let bodyText = "";
        const article = document.querySelector("article") || document.querySelector("main");
        if (article) {
          bodyText = (article as HTMLElement).innerText.slice(0, 5000);
        } else {
          bodyText = document.body.innerText.slice(0, 3000);
        }

        // High-res in-page gallery images
        const galleryImages: string[] = [];
        const imgs = Array.from(document.querySelectorAll("img"));
        for (const img of imgs) {
          const src = img.currentSrc || img.src;
          if (
            src &&
            src.startsWith("http") &&
            !src.includes(".svg") &&
            !src.includes("data:image") &&
            img.naturalWidth > 150 &&
            img.naturalHeight > 100
          ) {
            galleryImages.push(src);
            if (galleryImages.length >= 6) break;
          }
        }

        return {
          title,
          description,
          ogImage: ogImage || undefined,
          favicon: favicon || undefined,
          suggestedTags: Array.from(tags).slice(0, 6),
          readerText: bodyText.trim(),
          fetchedImages: galleryImages,
        };
      },
    });

    if (results && results[0]?.result) {
      const res = results[0].result;
      const updates: Partial<BookmarkMetadata> = {};
      if (res.title) updates.fetchedTitle = res.title;
      if (res.description) updates.description = res.description;
      if (res.ogImage) updates.ogImage = res.ogImage;
      if (res.favicon) updates.favicon = res.favicon;
      if (res.readerText) updates.readerContent = res.readerText;
      if (res.suggestedTags && res.suggestedTags.length > 0) updates.tags = res.suggestedTags;
      if (res.fetchedImages && res.fetchedImages.length > 0) updates.fetchedImages = res.fetchedImages;
      return updates;
    }
  } catch (err) {
    console.warn("Script extraction on tab failed:", err);
  }

  return {};
}

// Capture live screenshot and all assets (title, embeds, favicon, article) for a specific bookmark URL
export async function captureBookmarkUrlScreenshot(
  url: string,
  bookmarkId?: string,
  autoUpdateTitles?: boolean
): Promise<string | undefined> {
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

      const extracted = await extractTabDomMetadata(existingTab.id);

      // Restore focus to original manager tab
      if (currentTab?.id) {
        chrome.tabs.update(currentTab.id, { active: true });
      }

      const compressed = await compressImageDataUrl(rawDataUrl);

      if (bookmarkId) {
        await saveBookmarkMetadata(bookmarkId, {
          screenshot: compressed,
          lastCaptured: Date.now(),
          httpStatus: 200,
          httpStatusText: "OK",
          lastChecked: Date.now(),
          ...extracted,
        });

        if (autoUpdateTitles && extracted.fetchedTitle && chrome.bookmarks?.update) {
          try {
            await new Promise<void>((resolve) => {
              chrome.bookmarks.update(bookmarkId, { title: extracted.fetchedTitle! }, () => resolve());
            });
          } catch {}
        }
      }

      return compressed;
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
            const extracted = await extractTabDomMetadata(newTab.id!);
            if (!extracted.favicon && newTab.favIconUrl) {
              extracted.favicon = newTab.favIconUrl;
            }

            chrome.tabs.captureVisibleTab(newTab.windowId, { format: "png" }, async (rawDataUrl) => {
              // Clean up: close temporary tab and refocus manager tab
              try {
                if (newTab.id) chrome.tabs.remove(newTab.id);
                if (currentTab?.id) chrome.tabs.update(currentTab.id, { active: true });
              } catch {}

              if (rawDataUrl) {
                const compressed = await compressImageDataUrl(rawDataUrl);

                if (bookmarkId) {
                  await saveBookmarkMetadata(bookmarkId, {
                    screenshot: compressed,
                    lastCaptured: Date.now(),
                    httpStatus: 200,
                    httpStatusText: "OK",
                    lastChecked: Date.now(),
                    ...extracted,
                  });

                  if (autoUpdateTitles && extracted.fetchedTitle && chrome.bookmarks?.update) {
                    try {
                      await new Promise<void>((resolve) => {
                        chrome.bookmarks.update(bookmarkId, { title: extracted.fetchedTitle! }, () => resolve());
                      });
                    } catch {}
                  }
                }

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

export interface BatchScreenshotOptions {
  skipExisting?: boolean;
  settleDelayMs?: number;
  timeoutMs?: number;
  autoUpdateChromeBookmarkTitles?: boolean;
}

// Sequential batch screenshot capture for multiple bookmarks by loading live tabs
export async function runBatchTabScreenshots(
  bookmarks: EnhancedBookmark[],
  options: BatchScreenshotOptions = {},
  onProgress: (progress: BatchFetchProgress) => void,
  abortSignal?: AbortSignal
): Promise<{ total: number; captured: number; skipped: number; failed: number; aborted: boolean }> {
  const { skipExisting = true, settleDelayMs = 1200, timeoutMs = 15000 } = options;

  let current = 0;
  let capturedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const total = bookmarks.length;

  const updateUI = (title = "", url = "") => {
    if (abortSignal?.aborted) return;
    onProgress({
      isRunning: true,
      total,
      current,
      currentTitle: title,
      currentUrl: url,
      successCount: capturedCount,
      errorCount: failedCount,
      skippedCount,
    });
  };

  updateUI("Initializing batch tab capture...", "");

  if (!isChrome || !chrome.tabs) {
    onProgress({
      isRunning: false,
      total,
      current: 0,
      currentTitle: "Chrome Tabs API not available",
      currentUrl: "",
      successCount: 0,
      errorCount: 0,
      skippedCount: total,
    });
    return { total, captured: 0, skipped: total, failed: 0, aborted: false };
  }

  // Get manager tab and window to restore focus reliably
  let managerTabId: number | undefined;
  let managerWindowId: number | undefined;
  try {
    const [activeTab] = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs || []));
    });
    managerTabId = activeTab?.id;
    managerWindowId = activeTab?.windowId;
  } catch {}

  const queue: EnhancedBookmark[] = [];
  for (const b of bookmarks) {
    if (!b.url || !b.url.startsWith("http")) {
      skippedCount++;
      current++;
      continue;
    }
    if (skipExisting && b.screenshot) {
      skippedCount++;
      current++;
      continue;
    }
    queue.push(b);
  }

  updateUI();

  for (const item of queue) {
    if (abortSignal?.aborted) break;

    updateUI(item.title || "Loading webpage...", item.url || "");

    let temporaryTabId: number | undefined;

    try {
      // Create new tab in foreground to ensure browser paints pixels for captureVisibleTab
      const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
        chrome.tabs.create(
          { url: item.url, active: true, windowId: managerWindowId },
          (t) => {
            if (chrome.runtime.lastError || !t) {
              reject(chrome.runtime.lastError || new Error("Failed to create tab"));
            } else {
              resolve(t);
            }
          }
        );
      });

      temporaryTabId = tab.id;
      const tabWindowId = tab.windowId || managerWindowId;

      if (!tab.id) {
        throw new Error("No tab id returned");
      }

      // Wait for page load complete and capture both screenshot and live page metadata
      let extractedMeta: Partial<BookmarkMetadata> = {};

      const rawDataUrl = await new Promise<string | undefined>((resolve) => {
        let isResolved = false;

        const cleanup = () => {
          if (isResolved) return;
          isResolved = true;
          chrome.tabs.onUpdated.removeListener(onUpdatedListener);
          if (abortSignal) abortSignal.removeEventListener("abort", onAbortListener);
          clearTimeout(timerId);
        };

        const onAbortListener = () => {
          cleanup();
          resolve(undefined);
        };

        const timerId = setTimeout(() => {
          cleanup();
          resolve(undefined);
        }, timeoutMs);

        if (abortSignal) {
          abortSignal.addEventListener("abort", onAbortListener, { once: true });
        }

        const onUpdatedListener = async (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (updatedTabId === tab.id && changeInfo.status === "complete") {
            cleanup();
            if (abortSignal?.aborted) {
              resolve(undefined);
              return;
            }

            // Wait for fonts & layout animations to settle
            await new Promise((r) => setTimeout(r, settleDelayMs));

            if (abortSignal?.aborted) {
              resolve(undefined);
              return;
            }

            try {
              // 1. Extract live DOM metadata (title, embeds, favicon, reader, tags, gallery)
              extractedMeta = await extractTabDomMetadata(tab.id!);
              if (!extractedMeta.favicon && tab.favIconUrl) {
                extractedMeta.favicon = tab.favIconUrl;
              }

              // 2. Capture viewport snapshot
              chrome.tabs.captureVisibleTab(tabWindowId as any, { format: "png" }, (dataUrl) => {
                if (chrome.runtime.lastError || !dataUrl) {
                  resolve(undefined);
                } else {
                  resolve(dataUrl);
                }
              });
            } catch {
              resolve(undefined);
            }
          }
        };

        chrome.tabs.onUpdated.addListener(onUpdatedListener);
      });

      // Close the temporary tab as soon as snapshot is taken
      if (temporaryTabId) {
        try {
          await new Promise<void>((resolve) => {
            chrome.tabs.remove(temporaryTabId!, () => resolve());
          });
          temporaryTabId = undefined;
        } catch {}
      }

      if (abortSignal?.aborted) break;

      if (rawDataUrl) {
        const compressed = await compressImageDataUrl(rawDataUrl);
        const updates: Partial<BookmarkMetadata> = {
          screenshot: compressed,
          lastCaptured: Date.now(),
          httpStatus: 200,
          httpStatusText: "OK",
          lastChecked: Date.now(),
          ...extractedMeta,
        };

        if (extractedMeta.tags && extractedMeta.tags.length > 0) {
          updates.tags = Array.from(new Set([...(item.tags || []), ...extractedMeta.tags]));
        }

        await saveBookmarkMetadata(item.id, updates);

        // Update native Chrome bookmark title if option enabled
        if (
          options.autoUpdateChromeBookmarkTitles &&
          extractedMeta.fetchedTitle &&
          typeof chrome !== "undefined" &&
          chrome.bookmarks?.update
        ) {
          try {
            await new Promise<void>((resolve) => {
              chrome.bookmarks.update(item.id, { title: extractedMeta.fetchedTitle! }, () => resolve());
            });
          } catch {}
        }

        capturedCount++;
      } else {
        failedCount++;
      }
      current++;
    } catch (err: any) {
      if (temporaryTabId) {
        try {
          chrome.tabs.remove(temporaryTabId);
        } catch {}
      }
      if (abortSignal?.aborted || err.name === "AbortError") {
        break;
      }
      failedCount++;
      current++;
    } finally {
      if (!abortSignal?.aborted) {
        updateUI(item.title, item.url);
      }
    }
  }

  // Ensure manager tab is reactivated
  if (managerTabId) {
    try {
      await new Promise<void>((resolve) => {
        chrome.tabs.update(managerTabId!, { active: true }, () => resolve());
      });
    } catch {}
  }

  const wasAborted = !!abortSignal?.aborted;

  onProgress({
    isRunning: false,
    total,
    current,
    currentTitle: wasAborted ? "Stopped" : "Completed",
    currentUrl: "",
    successCount: capturedCount,
    errorCount: failedCount,
    skippedCount,
  });

  return {
    total,
    captured: capturedCount,
    skipped: skippedCount,
    failed: failedCount,
    aborted: wasAborted,
  };
}
