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
  const items = parseChromeBookmarksJson(raw);
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
