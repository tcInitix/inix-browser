import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  importBookmarks,
  type ImportBookmarkItem,
  type ImportBookmarksResult,
} from "../storage/bookmarks";
import { getChromeProfilePaths } from "./chrome-paths";

interface ChromeBookmarkNode {
  type?: string;
  name?: string;
  url?: string;
  children?: ChromeBookmarkNode[];
}

function walkChromeBookmarks(
  node: ChromeBookmarkNode,
  onBar: boolean,
  out: ImportBookmarkItem[]
): void {
  if (node.type === "url" && node.url) {
    if (node.url.startsWith("http://") || node.url.startsWith("https://")) {
      out.push({ url: node.url, title: node.name?.trim() || node.url, onBar });
    }
    return;
  }
  if (node.type === "folder" && node.children) {
    for (const child of node.children) {
      walkChromeBookmarks(child, onBar, out);
    }
  }
}

export function parseChromeBookmarksJson(raw: string): ImportBookmarkItem[] {
  const data = JSON.parse(raw) as { roots?: Record<string, ChromeBookmarkNode> };
  const items: ImportBookmarkItem[] = [];
  const roots = data.roots;
  if (!roots) return items;

  if (roots.bookmark_bar) walkChromeBookmarks(roots.bookmark_bar, true, items);
  if (roots.other) walkChromeBookmarks(roots.other, false, items);
  if (roots.synced) walkChromeBookmarks(roots.synced, false, items);
  return items;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

/** Extract inner content of the next <DL>…</DL> block (handles nesting). */
function extractDlContent(html: string, startFrom = 0): { content: string; end: number } | null {
  const slice = html.slice(startFrom);
  const openMatch = slice.match(/<DL[^>]*>/i);
  if (!openMatch || openMatch.index === undefined) return null;

  const contentStart = startFrom + openMatch.index + openMatch[0].length;
  let depth = 1;
  let i = contentStart;
  const lower = html.toLowerCase();

  while (i < html.length && depth > 0) {
    const nextOpen = lower.indexOf("<dl", i);
    const nextClose = lower.indexOf("</dl>", i);
    if (nextClose === -1) break;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 3;
      continue;
    }

    depth--;
    if (depth === 0) {
      return { content: html.slice(contentStart, nextClose), end: nextClose + 5 - startFrom };
    }
    i = nextClose + 5;
  }

  return null;
}

function walkNetscapeBookmarkSection(section: string, onBar: boolean, out: ImportBookmarkItem[]): void {
  let i = 0;
  const lower = section.toLowerCase();

  while (i < section.length) {
    const dtIdx = lower.indexOf("<dt", i);
    if (dtIdx === -1) break;

    const dtEnd = section.indexOf(">", dtIdx);
    if (dtEnd === -1) break;
    i = dtEnd + 1;

    const rest = section.slice(i);

    const h3Match = rest.match(/^<H3([^>]*)>([\s\S]*?)<\/H3>/i);
    if (h3Match) {
      const attrs = h3Match[1];
      const folderOnBar =
        onBar || /PERSONAL_TOOLBAR_FOLDER\s*=\s*["']?true/i.test(attrs);
      i += h3Match[0].length;

      const dl = extractDlContent(section, i);
      if (dl) {
        walkNetscapeBookmarkSection(dl.content, folderOnBar, out);
        i += dl.end;
      }
      continue;
    }

    const aMatch = rest.match(/^<A\s+([^>]*?)>([\s\S]*?)<\/A>/i);
    if (aMatch) {
      const hrefMatch = aMatch[1].match(/HREF\s*=\s*["']([^"']+)["']/i);
      const url = hrefMatch?.[1]?.trim();
      if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
        const title = decodeHtmlEntities(stripHtmlTags(aMatch[2]).trim() || url);
        out.push({ url, title, onBar });
      }
      i += aMatch[0].length;
      continue;
    }

    const nextDt = lower.indexOf("<dt", i);
    i = nextDt === -1 ? section.length : nextDt;
  }
}

/** Parse Chrome/Firefox/Edge HTML export (Bookmark Manager → Export bookmarks). */
export function parseChromeBookmarksHtml(raw: string): ImportBookmarkItem[] {
  const items: ImportBookmarkItem[] = [];
  const rootDl = extractDlContent(raw, 0);
  if (rootDl) {
    walkNetscapeBookmarkSection(rootDl.content, false, items);
  }
  return items;
}

function isJsonBookmarks(raw: string): boolean {
  const trimmed = raw.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function isHtmlBookmarks(raw: string): boolean {
  const trimmed = raw.trimStart();
  return (
    /NETSCAPE-Bookmark-file/i.test(raw) ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<HTML") ||
    trimmed.startsWith("<DL") ||
    trimmed.startsWith("<dl")
  );
}

export function parseChromeBookmarksFile(raw: string): ImportBookmarkItem[] {
  if (isJsonBookmarks(raw)) {
    return parseChromeBookmarksJson(raw);
  }
  if (isHtmlBookmarks(raw)) {
    return parseChromeBookmarksHtml(raw);
  }
  throw new Error(
    "Unrecognized bookmarks file. Use Chrome's HTML export (Bookmark Manager → ⋮ → Export bookmarks) or the Bookmarks JSON from your Chrome profile."
  );
}

function copyForRead(src: string): { path: string; cleanup: () => void } {
  const tmp = path.join(os.tmpdir(), `inix-import-${Date.now()}-${path.basename(src)}`);
  fs.copyFileSync(src, tmp);
  return {
    path: tmp,
    cleanup: () => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    },
  };
}

export function importChromeBookmarksFromFile(filePath: string): ImportBookmarksResult {
  const raw = fs.readFileSync(filePath, "utf8");
  const items = parseChromeBookmarksFile(raw);
  return importBookmarks(items);
}

export function importChromeBookmarksFromProfile(profileDir: string): ImportBookmarksResult {
  const { bookmarks } = getChromeProfilePaths(profileDir);
  if (!fs.existsSync(bookmarks)) {
    throw new Error("Chrome bookmarks file not found for this profile.");
  }

  let cleanup: (() => void) | undefined;
  try {
    const copy = copyForRead(bookmarks);
    cleanup = copy.cleanup;
    return importChromeBookmarksFromFile(copy.path);
  } catch (err) {
    if (err instanceof Error && err.message.includes("EBUSY")) {
      throw new Error("Close Chrome and try again, or choose the Bookmarks file manually.");
    }
    throw err;
  } finally {
    cleanup?.();
  }
}
