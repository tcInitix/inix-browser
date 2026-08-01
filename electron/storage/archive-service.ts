import crypto from "node:crypto";
import fs from "node:fs";
import type { WebContents } from "electron";
import { getSetting } from "./settings";import { META_SCRAPE_SCRIPT, type PageMeta, emptyMeta } from "./meta-scraper";
import { archivePathForBookmark, faviconPathForHash } from "./paths";
import { tabManager } from "../tab-manager";

export function isArchiveEnabled(): boolean {
  return getSetting("archive_enabled") !== "false";
}

export async function scrapePageMeta(wc: WebContents): Promise<PageMeta> {
  const url = wc.getURL();
  const title = wc.getTitle();
  try {
    const meta = (await wc.executeJavaScript(META_SCRAPE_SCRIPT)) as PageMeta;
    return { ...emptyMeta(url, title), ...meta, title: meta.title || title, url };
  } catch {
    return emptyMeta(url, title);
  }
}

export async function downloadFavicon(faviconUrl: string, pageUrl: string): Promise<string> {
  if (!faviconUrl) {
    try {
      faviconUrl = new URL("/favicon.ico", pageUrl).href;
    } catch {
      return "";
    }
  }

  try {
    const res = await fetch(faviconUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return "";
    const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
    const dest = faviconPathForHash(hash);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
    return dest;
  } catch {
    return "";
  }
}

export async function saveArchiveSnapshot(
  wc: WebContents,
  bookmarkId: number
): Promise<{ snapshotPath: string; snapshotAt: number } | null> {
  if (!isArchiveEnabled()) return null;

  const dest = archivePathForBookmark(bookmarkId);
  try {
    await wc.savePage(dest, "MHTML");
    if (!fs.existsSync(dest)) return null;
    return { snapshotPath: dest, snapshotAt: Date.now() };
  } catch (err) {
    console.error("[archive] save failed:", err);
    return null;
  }
}

export async function captureFromTab(tabId: string): Promise<{
  meta: PageMeta;
  faviconPath: string;
}> {
  const wc = tabManager.getWebContents(tabId);
  if (!wc || wc.isDestroyed()) {
    throw new Error("No active page to archive");
  }
  const meta = await scrapePageMeta(wc);
  const faviconPath = await downloadFavicon(meta.faviconUrl, meta.url);
  return { meta, faviconPath };
}

export function getArchiveLoadUrl(_bookmarkId: number, snapshotPath: string): string | null {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return null;
  return `file:///${snapshotPath.replace(/\\/g, "/")}`;
}