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

// Fetch and parse page metadata + HTTP status + Redirect detection
export async function fetchLivePageDetails(
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

    // Only parse HTML if scope includes embeds or all
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

    // Strip preload/prefetch links, stylesheets, and scripts before DOM parsing
    // to prevent Chromium from initiating background subresource preloads (e.g. fonts, next.js chunks)
    const sanitizedHtml = htmlText
      .replace(/<link\s+[^>]*rel=["']?(?:preload|prefetch|modulepreload|stylesheet|prerender)["']?[^>]*>/gi, "")
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");

    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitizedHtml, "text/html");

    const getMeta = (names: string[]) => {
      for (const name of names) {
        const el = doc.querySelector(
          `meta[name='${name}'], meta[property='${name}'], meta[itemprop='${name}']`
        );
        if (el) {
          const val = el.getAttribute("content");
          if (val) return val.trim();
        }
      }
      return "";
    };

    const title =
      getMeta(["og:title", "twitter:title"]) ||
      doc.title ||
      "";

    const description =
      getMeta(["description", "og:description", "twitter:description"]) ||
      "";

    let ogImage = getMeta(["og:image", "twitter:image", "twitter:image:src"]);
    if (ogImage && !ogImage.startsWith("http")) {
      try {
        ogImage = new URL(ogImage, url).href;
      } catch {}
    }

    // Favicon resolution
    let favicon = "";
    const iconEl = doc.querySelector("link[rel*='icon'], link[rel='apple-touch-icon']");
    if (iconEl) {
      const href = iconEl.getAttribute("href");
      if (href) {
        try {
          favicon = new URL(href, url).href;
        } catch {}
      }
    }
    if (!favicon) {
      try {
        const host = new URL(url).hostname;
        favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
      } catch {}
    }

    // Keywords and suggested tags
    const keywords = getMeta(["keywords", "news_keywords"]);
    const tags = new Set<string>();
    if (keywords) {
      keywords.split(",").forEach((k) => {
        const clean = normalizeTag(k);
        if (clean.length > 1 && clean.length < 25) tags.add(clean);
      });
    }

    // Extract extra in-page images for Browse Mode media gallery
    const fetchedImages: string[] = [];
    const imgEls = doc.querySelectorAll("img[src]");
    for (const img of Array.from(imgEls)) {
      const src = img.getAttribute("src");
      if (src && !src.startsWith("data:")) {
        try {
          const fullSrc = new URL(src, url).href;
          if (
            fullSrc.startsWith("http") &&
            !fullSrc.includes("tracking") &&
            !fullSrc.includes("pixel") &&
            !fetchedImages.includes(fullSrc)
          ) {
            fetchedImages.push(fullSrc);
            if (fetchedImages.length >= 8) break;
          }
        } catch {}
      }
    }

    // Article body for browse mode reader
    let readerText = "";
    const article = doc.querySelector("article") || doc.querySelector("main");
    if (article) {
      readerText = (article as HTMLElement).innerText?.slice(0, 5000) || "";
    }

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
      suggestedTags: Array.from(tags).slice(0, 6),
      readerText: readerText || undefined,
      fetchedImages,
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

// Batch refetch executor with concurrency & cancellation support
export async function runBatchRefetch(
  bookmarks: EnhancedBookmark[],
  options: {
    fetchScope: FetchScope;
    skip200OnRefetch: boolean;
    concurrency?: number;
  },
  onProgress: (progress: BatchFetchProgress) => void,
  abortSignal?: AbortSignal
): Promise<{ processed: number; success: number; errors: number; skipped: number; aborted: boolean }> {
  const { fetchScope, skip200OnRefetch, concurrency = 4 } = options;

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
    if (skip200OnRefetch && b.httpStatus === 200 && b.favicon) {
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
