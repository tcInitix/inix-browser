import type { Bookmark } from "../inix.d";

export type BookmarkIconMode = "favicon" | "letter";

export function parseBookmarkMeta(raw: string | undefined | null): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function bookmarkIconMode(bookmark: Bookmark): BookmarkIconMode {
  const meta = parseBookmarkMeta(bookmark.meta_json);
  return meta.icon === "letter" ? "letter" : "favicon";
}

/** First meaningful letter from the bookmark title (fallback: hostname). */
export function bookmarkGlyph(bookmark: Bookmark): string {
  const title = bookmark.title.trim();
  if (title) {
    const match = title.match(/[A-Za-z0-9]/);
    if (match) return match[0].toUpperCase();
    return title.charAt(0).toUpperCase();
  }
  try {
    const host = new URL(bookmark.url).hostname.replace(/^www\./, "");
    return host.charAt(0).toUpperCase() || "◆";
  } catch {
    return "◆";
  }
}

export function bookmarkRemoteFaviconUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return "";
  }
}
