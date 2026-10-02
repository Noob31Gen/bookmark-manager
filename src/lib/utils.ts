import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDomain(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function getFaviconUrl(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    // Chrome extension internal favicon helper if in extension, or Google favicon service as universal fallback
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
    }
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
  } catch {
    return "";
  }
}

export function formatDate(timestamp?: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return "";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(timestamp);
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^[#@]/, "").replace(/\s+/g, "-");
}
