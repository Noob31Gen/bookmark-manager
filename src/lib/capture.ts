import { ExtractedPageData, EnhancedBookmark, BookmarkMetadata, BatchFetchProgress, ArchiveSummary } from "./types";
import { normalizeTag } from "./utils";
import { saveBookmarkMetadata } from "./metadataStore";
import { putArchive, getArchive, renameArchive, PageArchive } from "./archiveStore";

const isChrome = typeof chrome !== "undefined" && !!chrome.tabs;

// --- Capture tuning ---
const THUMB_WIDTH = 1600; // card / preview thumbnail width (was 720)
const THUMB_QUALITY = 0.9;
const FULLPAGE_TARGET_SCALE = 2; // device px per CSS px for full-page captures (retina-like)
const FULLPAGE_MAX_SCALE = 3;
const MAX_CANVAS_DIM = 32000; // Chrome canvas hard limit is 32767
const MAX_CANVAS_AREA = 240_000_000; // Chrome canvas area limit is ~268M px
const WEBP_MAX_DIM = 16383; // WebP spec limit; taller images are encoded as JPEG
const CDP_CHUNK_PX = 8192; // max device px per CDP screenshot call (GPU texture safe)
const PENDING_ACTIVE_KEY = "pending:active-tab";

export interface FullPageImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface TabCaptureResult {
  screenshot?: string; // high-res thumbnail data URL (top of page)
  fullPage?: FullPageImage;
  mhtml?: Blob;
}

export interface TabCaptureOptions {
  fullPage?: boolean;
  mhtml?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

async function execInTab<T>(tabId: number, func: (...args: any[]) => T | Promise<T>, args: any[] = []): Promise<T | undefined> {
  if (!chrome.scripting?.executeScript) return undefined;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: func as any, args } as any);
    return res?.result as T;
  } catch {
    return undefined;
  }
}

// Resize and compress base64 image data URL
export async function compressImageDataUrl(
  dataUrl: string,
  maxWidth = THUMB_WIDTH,
  quality = THUMB_QUALITY
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

      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/webp", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Build a high-res thumbnail from the top (16:10 region) of a screenshot
export async function createThumbnail(
  source: Blob | string,
  maxWidth = THUMB_WIDTH,
  quality = THUMB_QUALITY
): Promise<string | undefined> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const srcW = img.naturalWidth;
    const srcH = Math.min(img.naturalHeight, Math.round(srcW * 0.625));
    const w = Math.min(maxWidth, srcW);
    const h = Math.round((srcH * w) / srcW);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, w, h);
    return canvas.toDataURL("image/webp", quality);
  } catch {
    return undefined;
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}

function captureVisibleTabPng(windowId?: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!chrome.tabs?.captureVisibleTab) return resolve(undefined);
    chrome.tabs.captureVisibleTab(windowId as any, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) resolve(undefined);
      else resolve(dataUrl);
    });
  });
}

// Scroll through the page so lazy-loaded images/sections render before capture. Returns original scrollY.
async function primeLazyContent(tabId: number): Promise<number | undefined> {
  return execInTab<number>(tabId, async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const start = window.scrollY;
    const step = Math.max(300, Math.floor(window.innerHeight * 0.85));
    const maxH = Math.min(document.documentElement.scrollHeight, 30000);
    for (let y = 0; y < maxH; y += step) {
      window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
      await wait(80);
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    await wait(350);
    return start;
  });
}

async function scrollTabTo(tabId: number, top: number) {
  await execInTab(tabId, (y: number) => window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior }), [top]);
}

// Full-page capture via Chrome DevTools Protocol (renders beyond viewport, high DPI, no scrolling artifacts)
async function captureFullPageViaDebugger(tabId: number): Promise<FullPageImage | undefined> {
  if (!chrome.debugger?.attach) return undefined;
  const target = { tabId };
  const send = <T = any>(method: string, params?: object) =>
    new Promise<T>((resolve, reject) => {
      chrome.debugger.sendCommand(target, method, params, (res) => {
        const e = chrome.runtime.lastError;
        if (e) reject(new Error(e.message));
        else resolve(res as T);
      });
    });

  try {
    await new Promise<void>((resolve, reject) =>
      chrome.debugger.attach(target, "1.3", () => {
        const e = chrome.runtime.lastError;
        if (e) reject(new Error(e.message));
        else resolve();
      })
    );
  } catch (err) {
    console.warn("Debugger attach failed, falling back to scroll capture:", err);
    return undefined;
  }

  try {
    const metrics: any = await send("Page.getLayoutMetrics");
    const content = metrics.cssContentSize || metrics.contentSize;
    const vp = metrics.cssLayoutViewport || metrics.layoutViewport;
    const evalRes: any = await send("Runtime.evaluate", { expression: "window.devicePixelRatio", returnByValue: true });
    const dpr = Number(evalRes?.result?.value) || 1;

    const cssW = Math.max(1, Math.ceil(vp.clientWidth));
    const fullH = Math.max(1, Math.ceil(content.height), Math.ceil(vp.clientHeight));

    // Choose output scale within canvas limits; never below 1x
    let scale = Math.min(Math.max(FULLPAGE_TARGET_SCALE, dpr), FULLPAGE_MAX_SCALE);
    scale = Math.min(scale, MAX_CANVAS_DIM / cssW, MAX_CANVAS_DIM / fullH, Math.sqrt(MAX_CANVAS_AREA / (cssW * fullH)));
    scale = Math.max(1, scale);
    const cssH = Math.min(fullH, Math.floor(MAX_CANVAS_DIM / scale), Math.floor(MAX_CANVAS_AREA / (cssW * scale * scale)));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cssW * scale);
    canvas.height = Math.round(cssH * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const chunkCss = Math.max(256, Math.floor(CDP_CHUNK_PX / scale));
    for (let y = 0; y < cssH; y += chunkCss) {
      const h = Math.min(chunkCss, cssH - y);
      const shot = await send<{ data: string }>("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        fromSurface: true,
        clip: { x: 0, y, width: cssW, height: h, scale: scale / dpr },
      });
      const img = await loadImage(`data:image/png;base64,${shot.data}`);
      ctx.drawImage(img, 0, Math.round(y * scale), canvas.width, Math.round(h * scale));
    }

    const useWebp = canvas.width <= WEBP_MAX_DIM && canvas.height <= WEBP_MAX_DIM;
    const blob = await canvasToBlob(canvas, useWebp ? "image/webp" : "image/jpeg", 0.92);
    return blob ? { blob, width: canvas.width, height: canvas.height } : undefined;
  } catch (err) {
    console.warn("CDP full-page capture failed:", err);
    return undefined;
  } finally {
    chrome.debugger.detach(target, () => void chrome.runtime.lastError);
  }
}

// Fallback: scroll + captureVisibleTab + stitch (used when debugger is unavailable, e.g. DevTools open)
async function captureFullPageViaScrolling(tabId: number, windowId?: number): Promise<FullPageImage | undefined> {
  const info = await execInTab<{ h: number; vh: number }>(tabId, () => ({
    h: document.documentElement.scrollHeight,
    vh: window.innerHeight,
  }));
  if (!info || !info.vh) return undefined;

  let canvas: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  let ratio = 1;
  let cssH = info.h;
  let lastCapture = 0;
  let hidFixed = false;

  try {
    for (let y = 0; y < cssH; y += info.vh) {
      const actualY =
        (await execInTab<number>(
          tabId,
          (top: number) => {
            window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
            return window.scrollY;
          },
          [y]
        )) ?? y;

      // Hide fixed/sticky headers after the first frame so they don't repeat down the page
      if (y > 0 && !hidFixed) {
        hidFixed = true;
        await execInTab(tabId, () => {
          document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
            const pos = getComputedStyle(el).position;
            if (pos === "fixed" || pos === "sticky") {
              el.setAttribute("data-n31-hidden", el.style.visibility || "");
              el.style.setProperty("visibility", "hidden", "important");
            }
          });
        });
      }

      // captureVisibleTab is rate limited (~2 calls/sec)
      await sleep(Math.max(250, 600 - (Date.now() - lastCapture)));
      const dataUrl = await captureVisibleTabPng(windowId);
      lastCapture = Date.now();
      if (!dataUrl) break;

      const img = await loadImage(dataUrl);
      if (!canvas) {
        ratio = img.naturalHeight / info.vh;
        cssH = Math.min(info.h, Math.floor(MAX_CANVAS_DIM / ratio), Math.floor(MAX_CANVAS_AREA / (img.naturalWidth * ratio)));
        canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = Math.round(cssH * ratio);
        ctx = canvas.getContext("2d");
      }
      ctx?.drawImage(img, 0, Math.round(actualY * ratio));
      if (actualY + info.vh >= cssH) break;
    }
  } finally {
    if (hidFixed) {
      await execInTab(tabId, () => {
        document.querySelectorAll<HTMLElement>("[data-n31-hidden]").forEach((el) => {
          el.style.visibility = el.getAttribute("data-n31-hidden") || "";
          el.removeAttribute("data-n31-hidden");
        });
      });
    }
  }

  if (!canvas) return undefined;
  const useWebp = canvas.width <= WEBP_MAX_DIM && canvas.height <= WEBP_MAX_DIM;
  const blob = await canvasToBlob(canvas, useWebp ? "image/webp" : "image/jpeg", 0.92);
  return blob ? { blob, width: canvas.width, height: canvas.height } : undefined;
}

// Save the page as a single-file MHTML web archive
export function captureMhtml(tabId: number): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    if (!chrome.pageCapture?.saveAsMHTML) return resolve(undefined);
    try {
      chrome.pageCapture.saveAsMHTML({ tabId }, (data) => {
        if (chrome.runtime.lastError || !data) resolve(undefined);
        else resolve(data as Blob);
      });
    } catch {
      resolve(undefined);
    }
  });
}

// Capture thumbnail + full-page screenshot + MHTML from a loaded tab
export async function captureTabAssets(
  tab: { id: number; windowId?: number },
  options: TabCaptureOptions = {}
): Promise<TabCaptureResult> {
  const { fullPage = true, mhtml = true } = options;
  const result: TabCaptureResult = {};
  const startY = fullPage || mhtml ? await primeLazyContent(tab.id) : undefined;

  if (mhtml) result.mhtml = await captureMhtml(tab.id);

  if (fullPage) {
    result.fullPage =
      (await captureFullPageViaDebugger(tab.id)) || (await captureFullPageViaScrolling(tab.id, tab.windowId));
  }

  if (result.fullPage) {
    result.screenshot = await createThumbnail(result.fullPage.blob);
  }

  if (!result.screenshot) {
    await scrollTabTo(tab.id, 0);
    await sleep(150);
    const raw = await captureVisibleTabPng(tab.windowId);
    if (raw) result.screenshot = (await createThumbnail(raw)) || (await compressImageDataUrl(raw));
  }

  if (startY) await scrollTabTo(tab.id, startY);
  return result;
}

function summarizeArchive(a: PageArchive): ArchiveSummary {
  return {
    capturedAt: a.capturedAt,
    fullPageBytes: a.fullPage?.size,
    fullPageWidth: a.fullPageWidth,
    fullPageHeight: a.fullPageHeight,
    mhtmlBytes: a.mhtml?.size,
  };
}

// Persist heavy assets into IndexedDB; returns metadata updates (thumbnail + archive summary)
export async function persistTabCapture(
  archiveId: string,
  url: string,
  title: string | undefined,
  result: TabCaptureResult
): Promise<Partial<BookmarkMetadata>> {
  const updates: Partial<BookmarkMetadata> = {};
  if (result.screenshot) {
    updates.screenshot = result.screenshot;
    updates.lastCaptured = Date.now();
  }
  if (result.fullPage || result.mhtml) {
    const archive: PageArchive = {
      id: archiveId,
      url,
      title,
      capturedAt: Date.now(),
      fullPage: result.fullPage?.blob,
      fullPageWidth: result.fullPage?.width,
      fullPageHeight: result.fullPage?.height,
      mhtml: result.mhtml,
    };
    try {
      await putArchive(archive);
      updates.archive = summarizeArchive(archive);
    } catch (err) {
      console.warn("Failed to store page archive:", err);
    }
  }
  return updates;
}

// Capture screenshot of current active tab (full page + MHTML are staged until the bookmark is saved)
export async function captureActiveTabScreenshot(): Promise<string | undefined> {
  if (!isChrome || !chrome.tabs?.captureVisibleTab) {
    return undefined;
  }

  try {
    const [tab] = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs || []));
    });

    if (!tab?.id || !tab.url?.startsWith("http")) {
      const raw = await captureVisibleTabPng(tab?.windowId);
      return raw ? await compressImageDataUrl(raw) : undefined;
    }

    const result = await captureTabAssets({ id: tab.id, windowId: tab.windowId });
    if (result.fullPage || result.mhtml) {
      await persistTabCapture(PENDING_ACTIVE_KEY, tab.url, tab.title, result);
    }
    return result.screenshot;
  } catch (err) {
    console.warn("Could not capture screenshot of active tab:", err);
    return undefined;
  }
}

// Attach the staged active-tab archive (from captureActiveTabScreenshot) to a saved bookmark
export async function commitPendingArchive(bookmarkId: string, url?: string): Promise<void> {
  try {
    const pending = await getArchive(PENDING_ACTIVE_KEY);
    if (!pending || (url && pending.url !== url)) return;
    const moved = await renameArchive(PENDING_ACTIVE_KEY, bookmarkId);
    if (moved) await saveBookmarkMetadata(bookmarkId, { archive: summarizeArchive(moved) });
  } catch (err) {
    console.warn("Failed to commit pending archive:", err);
  }
}

// Resolve when a tab finishes loading (false on timeout/abort)
function waitForTabComplete(tabId: number, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      signal?.removeEventListener("abort", onAbort);
      clearTimeout(timer);
      resolve(ok);
    };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === "complete") finish(true);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (t) => {
      if (!chrome.runtime.lastError && t?.status === "complete" && t.url && t.url !== "about:blank") finish(true);
    });
  });
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

// Capture live screenshot, full-page image, MHTML and all assets (title, embeds, favicon, article) for a bookmark URL
export async function captureBookmarkUrlScreenshot(
  url: string,
  bookmarkId?: string,
  autoUpdateTitles?: boolean
): Promise<string | undefined> {
  if (!isChrome || !chrome.tabs) return undefined;
  if (!url || !url.startsWith("http")) return undefined;

  let temporaryTabId: number | undefined;
  let currentTab: chrome.tabs.Tab | undefined;

  try {
    // 1. Check if the user already has a tab open with this bookmark's URL
    const allTabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({}, (tabs) => resolve(tabs || []));
    });

    const targetDomain = new URL(url).hostname;
    const existingTab = allTabs.find(
      (t) => t.url && (t.url === url || (t.url.includes(targetDomain) && !t.url.startsWith("chrome://")))
    );

    [currentTab] = await new Promise<chrome.tabs.Tab[]>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs || []));
    });

    let target: chrome.tabs.Tab;

    if (existingTab && existingTab.id && existingTab.windowId !== undefined) {
      // Temporarily activate existing tab to take the snapshot
      await new Promise<void>((resolve) => {
        chrome.tabs.update(existingTab.id!, { active: true }, () => resolve());
      });
      await sleep(600); // allow render settle
      target = existingTab;
    } else {
      // 2. Open a temporary visible tab to load the bookmark's actual page
      const newTab = await new Promise<chrome.tabs.Tab>((resolve) => {
        chrome.tabs.create({ url, active: true }, (tab) => resolve(tab));
      });
      if (!newTab || !newTab.id || newTab.windowId === undefined) return undefined;
      temporaryTabId = newTab.id;

      const loaded = await waitForTabComplete(newTab.id, 20000);
      if (!loaded) return undefined;

      // Give dynamic images & web fonts time to render
      await sleep(900);
      target = await chrome.tabs.get(newTab.id).catch(() => newTab);
    }

    const extracted = await extractTabDomMetadata(target.id!);
    if (!extracted.favicon && target.favIconUrl) {
      extracted.favicon = target.favIconUrl;
    }

    const result = await captureTabAssets({ id: target.id!, windowId: target.windowId });
    if (!result.screenshot) return undefined;

    if (bookmarkId) {
      const assetUpdates = await persistTabCapture(bookmarkId, url, extracted.fetchedTitle, result);
      await saveBookmarkMetadata(bookmarkId, {
        httpStatus: 200,
        httpStatusText: "OK",
        lastChecked: Date.now(),
        ...extracted,
        ...assetUpdates,
      });

      if (autoUpdateTitles && extracted.fetchedTitle && chrome.bookmarks?.update) {
        try {
          await new Promise<void>((resolve) => {
            chrome.bookmarks.update(bookmarkId, { title: extracted.fetchedTitle! }, () => resolve());
          });
        } catch {}
      }
    }

    return result.screenshot;
  } catch (err) {
    console.warn("Could not capture bookmark tab snapshot:", err);
    return undefined;
  } finally {
    // Clean up: close temporary tab and refocus manager tab
    if (temporaryTabId) {
      try {
        await chrome.tabs.remove(temporaryTabId);
      } catch {}
    }
    if (currentTab?.id) {
      chrome.tabs.update(currentTab.id, { active: true }, () => void chrome.runtime.lastError);
    }
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
  captureArchive?: boolean; // full-page screenshot + MHTML (default true)
}

// Sequential batch screenshot capture for multiple bookmarks by loading live tabs
export async function runBatchTabScreenshots(
  bookmarks: EnhancedBookmark[],
  options: BatchScreenshotOptions = {},
  onProgress: (progress: BatchFetchProgress) => void,
  abortSignal?: AbortSignal
): Promise<{ total: number; captured: number; skipped: number; failed: number; aborted: boolean }> {
  const { skipExisting = true, settleDelayMs = 1200, timeoutMs = 15000, captureArchive = true } = options;

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
    if (skipExisting && b.screenshot && (!captureArchive || b.archive)) {
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
      // Create new tab in foreground to ensure browser paints pixels for capture
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
      const tabWindowId = tab.windowId ?? managerWindowId;

      if (!tab.id) {
        throw new Error("No tab id returned");
      }

      const loaded = await waitForTabComplete(tab.id, timeoutMs, abortSignal);
      if (abortSignal?.aborted) break;

      let captured = false;
      if (loaded) {
        // Wait for fonts & layout animations to settle
        await sleep(settleDelayMs);
        if (abortSignal?.aborted) break;

        // 1. Extract live DOM metadata (title, embeds, favicon, reader, tags, gallery)
        const extractedMeta = await extractTabDomMetadata(tab.id);
        const liveTab = await chrome.tabs.get(tab.id).catch(() => tab);
        if (!extractedMeta.favicon && liveTab.favIconUrl) {
          extractedMeta.favicon = liveTab.favIconUrl;
        }

        // 2. Capture thumbnail + full-page screenshot + MHTML archive
        const result = await captureTabAssets(
          { id: tab.id, windowId: tabWindowId },
          { fullPage: captureArchive, mhtml: captureArchive }
        );

        if (result.screenshot && !abortSignal?.aborted) {
          const assetUpdates = await persistTabCapture(
            item.id,
            item.url!,
            extractedMeta.fetchedTitle || item.title,
            result
          );
          const updates: Partial<BookmarkMetadata> = {
            httpStatus: 200,
            httpStatusText: "OK",
            lastChecked: Date.now(),
            ...extractedMeta,
            ...assetUpdates,
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
          captured = true;
        }
      }

      if (abortSignal?.aborted) break;
      if (captured) capturedCount++;
      else failedCount++;
      current++;
    } catch (err: any) {
      if (abortSignal?.aborted || err.name === "AbortError") {
        break;
      }
      failedCount++;
      current++;
    } finally {
      // Close the temporary tab as soon as capture is done
      if (temporaryTabId) {
        try {
          await chrome.tabs.remove(temporaryTabId);
        } catch {}
      }
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
