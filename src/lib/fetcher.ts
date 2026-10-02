import { EnhancedBookmark, FetchScope, BatchFetchProgress, BookmarkMetadata } from "./types";
import { saveBookmarkMetadata } from "./metadataStore";
import { normalizeTag } from "./utils";

export interface FetchResult {
  url: string;
  finalUrl?: string;
  isRedirect?: boolean;
  httpStatus: number;
  httpStatusText: string;
  title?: string;
  description?: string;
  ogImage?: string;
  favicon?: string;
  suggestedTags?: string[];
  readerText?: string;
  fetchedImages?: string[];
}

// Decode HTML entities safely without invoking the browser DOM
function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(Number(code));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      try {
        return String.fromCharCode(parseInt(code, 16));
      } catch {
        return "";
      }
    });
}

// Extract meta tags by property / name / itemprop
function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const metaTagRegex = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaTagRegex.exec(html)) !== null) {
    const tag = match[0];
    const nameMatch = tag.match(/(?:name|property|itemprop|http-equiv)\s*=\s*["']([^"']+)["']/i);
    const contentMatch =
      tag.match(/content\s*=\s*["']([^"']*)["']/i) ||
      tag.match(/content\s*=\s*([^\s>]+)/i);

    if (nameMatch && contentMatch) {
      const key = nameMatch[1].toLowerCase().trim();
      const val = decodeHtmlEntities(contentMatch[1].trim());
      if (val && !meta[key]) {
        meta[key] = val;
      }
    }
  }
  return meta;
}

// Extract title from <title> tag or OpenGraph fallback
function extractTitle(html: string, meta: Record<string, string>): string {
  if (meta["og:title"]) return meta["og:title"];
  if (meta["twitter:title"]) return meta["twitter:title"];

  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (titleMatch) {
    return decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "").trim());
  }
  return "";
}

// Extract description
function extractDescription(meta: Record<string, string>): string {
  return (
    meta["description"] ||
    meta["og:description"] ||
    meta["twitter:description"] ||
    ""
  );
}

// Extract OpenGraph / Twitter Image
function extractOgImage(meta: Record<string, string>, baseUrl: string): string {
  const imgUrl =
    meta["og:image"] ||
    meta["twitter:image"] ||
    meta["twitter:image:src"] ||
    "";
  if (!imgUrl) return "";

  try {
    return new URL(imgUrl, baseUrl).href;
  } catch {
    return imgUrl.startsWith("http") ? imgUrl : "";
  }
}

// Extract Favicon from link tags or Google S2 fallback
function extractFavicon(html: string, baseUrl: string): string {
  const iconLinkRegex = /<link\b[^>]*\brel\s*=\s*["']?(?:shortcut\s+icon|icon|apple-touch-icon)["']?[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = iconLinkRegex.exec(html)) !== null) {
    const tag = match[0];
    const hrefMatch =
      tag.match(/href\s*=\s*["']([^"']+)["']/i) ||
      tag.match(/href\s*=\s*([^\s>]+)/i);
    if (hrefMatch) {
      try {
        const fullUrl = new URL(hrefMatch[1].trim(), baseUrl).href;
        if (fullUrl.startsWith("http")) return fullUrl;
      } catch {}
    }
  }

  // Fallback to Google S2 Favicon API
  try {
    const host = new URL(baseUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "";
  }
}

// Extract keywords & suggested tags
function extractSuggestedTags(meta: Record<string, string>): string[] {
  const keywords = meta["keywords"] || meta["news_keywords"] || "";
  const tags = new Set<string>();
  if (keywords) {
    keywords.split(",").forEach((k) => {
      const clean = normalizeTag(k);
      if (clean.length > 1 && clean.length < 25) tags.add(clean);
    });
  }
  return Array.from(tags).slice(0, 6);
}

// Extract in-page gallery images
function extractPageImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];
  const imgRegex = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && !src.startsWith("data:")) {
      try {
        const full = new URL(src, baseUrl).href;
        if (
          full.startsWith("http") &&
          !full.includes("tracking") &&
          !full.includes("pixel") &&
          !full.includes("1x1") &&
          !images.includes(full)
        ) {
          images.push(full);
          if (images.length >= 8) break;
        }
      } catch {}
    }
  }
  return images;
}

// Extract readable article text
function extractReaderText(html: string): string {
  const articleMatch = html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)\s*>/i);
  const rawBlock = articleMatch ? articleMatch[1] : html;

  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let pMatch: RegExpExecArray | null;
  const paragraphs: string[] = [];

  while ((pMatch = pRegex.exec(rawBlock)) !== null) {
    const cleanText = pMatch[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleanText.length > 30) {
      paragraphs.push(decodeHtmlEntities(cleanText));
      if (paragraphs.length >= 10) break;
    }
  }

  return paragraphs.join("\n\n").slice(0, 5000);
}

// Direct network fetch and string metadata extraction (Used by background service worker)
export async function directFetchPageDetails(
  url: string,
  scope: FetchScope = "all",
  signal?: AbortSignal
): Promise<FetchResult> {
  if (!url || !url.startsWith("http")) {
    return {
      url,
      httpStatus: 0,
      httpStatusText: "Invalid URL",
    };
  }

  if (signal?.aborted) {
    throw new DOMException("Operation aborted", "AbortError");
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 12000); // 12s timeout

  let userAborted = false;
  const onUserAbort = () => {
    userAborted = true;
    timeoutController.abort();
  };

  if (signal) {
    signal.addEventListener("abort", onUserAbort, { once: true });
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: timeoutController.signal,
    });

    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", onUserAbort);
    }

    const httpStatus = res.status;
    const httpStatusText = res.statusText || (httpStatus === 200 ? "OK" : `HTTP ${httpStatus}`);

    // Detect redirects (either via response URL difference, redirected flag, or 3xx status)
    const finalUrl = res.url && res.url !== url ? res.url : undefined;
    const isRedirect =
      res.redirected ||
      (httpStatus >= 300 && httpStatus < 400) ||
      (!!finalUrl && finalUrl.replace(/\/$/, "") !== url.replace(/\/$/, ""));

    // If HTTP error (4xx / 5xx), return status immediately
    if (!res.ok) {
      return {
        url,
        finalUrl,
        isRedirect,
        httpStatus,
        httpStatusText: res.status === 404 ? "Not Found" : httpStatusText,
      };
    }

    // If screenshots_only, skip HTML body parsing
    if (scope === "screenshots_only") {
      return {
        url,
        finalUrl,
        isRedirect,
        httpStatus,
        httpStatusText,
      };
    }

    const htmlText = await res.text();

    // Pure regex/string metadata extraction (zero DOMParser, 100% CSP safe)
    const meta = extractMetaTags(htmlText);
    const title = extractTitle(htmlText, meta);
    const description = extractDescription(meta);
    const ogImage = extractOgImage(meta, url);
    const favicon = extractFavicon(htmlText, url);
    const suggestedTags = extractSuggestedTags(meta);
    const fetchedImages = extractPageImages(htmlText, url);
    const readerText = extractReaderText(htmlText);

    return {
      url,
      finalUrl,
      isRedirect,
      httpStatus,
      httpStatusText,
      title: title || undefined,
      description: description || undefined,
      ogImage: ogImage || undefined,
      favicon: favicon || undefined,
      suggestedTags: suggestedTags.length > 0 ? suggestedTags : undefined,
      readerText: readerText || undefined,
      fetchedImages: fetchedImages.length > 0 ? fetchedImages : undefined,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", onUserAbort);
    }

    // If aborted by user, rethrow so caller can terminate immediately without saving 408 errors
    if (userAborted || signal?.aborted) {
      throw new DOMException("Operation aborted by user", "AbortError");
    }

    const isTimeout = err.name === "AbortError";
    return {
      url,
      httpStatus: isTimeout ? 408 : 0,
      httpStatusText: isTimeout ? "Timeout (408)" : err.message || "Network Error",
    };
  }
}

// Fetch and parse page metadata + HTTP status + Redirect detection
// Delegates to background ServiceWorker when in window context to avoid document HTTP Link preload header evaluation
export async function fetchLivePageDetails(
  url: string,
  scope: FetchScope = "all",
  signal?: AbortSignal
): Promise<FetchResult> {
  // If in browser window context and chrome.runtime is available, delegate to background service worker
  const isWindowContext = typeof window !== "undefined" && typeof document !== "undefined";
  const hasRuntime = typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;

  if (isWindowContext && hasRuntime) {
    return new Promise<FetchResult>((resolve) => {
      let resolved = false;

      const onAbort = () => {
        if (!resolved) {
          resolved = true;
          resolve({
            url,
            httpStatus: 408,
            httpStatusText: "Aborted",
          });
        }
      };

      if (signal) {
        if (signal.aborted) {
          return resolve({ url, httpStatus: 408, httpStatusText: "Aborted" });
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        chrome.runtime.sendMessage(
          { action: "FETCH_PAGE_DETAILS", url, scope },
          (response) => {
            if (signal) signal.removeEventListener("abort", onAbort);
            if (resolved) return;
            resolved = true;

            if (chrome.runtime.lastError || !response || !response.success) {
              // Fallback to direct fetch if background worker is unavailable
              directFetchPageDetails(url, scope, signal).then(resolve).catch((err) => {
                resolve({
                  url,
                  httpStatus: 0,
                  httpStatusText: err.message || "Fetch failed",
                });
              });
            } else {
              resolve(response.result);
            }
          }
        );
      } catch {
        if (!resolved) {
          resolved = true;
          directFetchPageDetails(url, scope, signal).then(resolve);
        }
      }
    });
  }

  // Inside background service worker or headless environment
  return directFetchPageDetails(url, scope, signal);
}

// Batch refetch executor with concurrency & cancellation support
export async function runBatchRefetch(
  bookmarks: EnhancedBookmark[],
  options: {
    fetchScope: FetchScope;
    skip200OnRefetch: boolean;
    refetchErrorsOnly?: boolean;
    concurrency?: number;
  },
  onProgress: (progress: BatchFetchProgress) => void,
  abortSignal?: AbortSignal
): Promise<{ processed: number; success: number; errors: number; skipped: number; aborted: boolean }> {
  const { fetchScope, skip200OnRefetch, refetchErrorsOnly = false, concurrency = 4 } = options;

  let current = 0;
  let successCount = 0;
  let errorCount = 0;
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
      successCount,
      errorCount,
      skippedCount,
    });
  };

  updateUI("Starting refetch...", "");

  // Prepare queue
  const queue: EnhancedBookmark[] = [];
  for (const b of bookmarks) {
    const isError =
      b.httpStatus !== undefined &&
      b.httpStatus !== null &&
      (b.httpStatus >= 400 || b.httpStatus === 0);
    const isHealthy200 = b.httpStatus === 200 && b.favicon;

    if (refetchErrorsOnly) {
      if (!isError) {
        skippedCount++;
        current++;
      } else {
        queue.push(b);
      }
    } else if (skip200OnRefetch && isHealthy200) {
      skippedCount++;
      current++;
    } else {
      queue.push(b);
    }
  }

  updateUI();

  // Worker loop with concurrency limit
  async function worker() {
    while (queue.length > 0) {
      if (abortSignal?.aborted) break;

      const item = queue.shift();
      if (!item || !item.url) continue;

      if (abortSignal?.aborted) break;
      updateUI(item.title, item.url);

      try {
        const result = await fetchLivePageDetails(item.url, fetchScope, abortSignal);

        if (abortSignal?.aborted) break;

        const updates: Partial<BookmarkMetadata> = {
          httpStatus: result.httpStatus,
          httpStatusText: result.httpStatusText,
          finalUrl: result.finalUrl,
          isRedirect: result.isRedirect,
          lastChecked: Date.now(),
        };

        if (fetchScope !== "screenshots_only") {
          if (result.ogImage) updates.ogImage = result.ogImage;
          if (result.favicon) updates.favicon = result.favicon;
          if (result.description && !item.description) updates.description = result.description;
          if (result.readerText && !item.readerContent) updates.readerContent = result.readerText;
          if (result.fetchedImages && result.fetchedImages.length > 0) {
            updates.fetchedImages = result.fetchedImages;
          }
          if (result.suggestedTags && result.suggestedTags.length > 0) {
            updates.tags = Array.from(new Set([...item.tags, ...result.suggestedTags]));
          }
        }

        await saveBookmarkMetadata(item.id, updates);

        if (result.httpStatus >= 200 && result.httpStatus < 400) {
          successCount++;
        } else {
          errorCount++;
        }
        current++;
      } catch (err: any) {
        if (abortSignal?.aborted || err.name === "AbortError") {
          break;
        }
        errorCount++;
        current++;
      } finally {
        if (!abortSignal?.aborted) {
          updateUI(item.title, item.url);
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker());
  await Promise.all(workers);

  const wasAborted = !!abortSignal?.aborted;

  onProgress({
    isRunning: false,
    total,
    current,
    currentTitle: wasAborted ? "Stopped" : "Completed",
    currentUrl: "",
    successCount,
    errorCount,
    skippedCount,
  });

  return {
    processed: current,
    success: successCount,
    errors: errorCount,
    skipped: skippedCount,
    aborted: wasAborted,
  };
}
