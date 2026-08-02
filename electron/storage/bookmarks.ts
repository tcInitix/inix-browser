import fs from "node:fs";
import { runQuery, runExec, lastInsertId, saveDatabase } from "./db";
import { tabManager } from "../tab-manager";
import { captureFromTab, saveArchiveSnapshot } from "./archive-service";
import { extractAutoTags, parseTagsFromTitle } from "./tagging";
import { queueEmbedding } from "./vector-index";
import {
  pinBookmarkAtLayoutIndex,
  pinBookmarkAtCenter,
  getDefaultWorkspaceId,
  setPin,
  isBookmarkPinned,
  countWorkspacePins,
} from "./workspaces";
import { getSettings } from "./settings";
import { EXTRACT_PAGE_SCRIPT } from "./page-extractor";
import {
  appendBookmarkToBarRoot,
  addBookmarkNode,
  deleteNode,
  importBarTree,
  type ImportBarNode,
} from "./bookmark-bar";

export interface Bookmark {
  id: number;
  url: string;
  title: string;
  content_id: number | null;
  created_at: number;
  tags: string;
  description: string;
  og_title: string;
  og_image: string;
  meta_json: string;
  favicon_path: string;
  snapshot_path: string;
  snapshot_at: number | null;
  notes: string;
  on_bookmark_bar?: boolean;
}

export interface BookmarkFilter {
  tags?: string[];
  workspaceId?: number;
  query?: string;
}

export interface SaveBookmarkOptions {
  userTags?: string[];
  workspaceId?: number;
  pinX?: number;
  pinY?: number;
  barParentId?: number | null;
  barInsertIndex?: number;
}

function rowToBookmark(row: Record<string, unknown>): Bookmark {
  return {
    id: row.id as number,
    url: row.url as string,
    title: row.title as string,
    content_id: (row.content_id as number | null) ?? null,
    created_at: row.created_at as number,
    tags: (row.tags as string) ?? "",
    description: (row.description as string) ?? "",
    og_title: (row.og_title as string) ?? "",
    og_image: (row.og_image as string) ?? "",
    meta_json: (row.meta_json as string) ?? "{}",
    favicon_path: (row.favicon_path as string) ?? "",
    snapshot_path: (row.snapshot_path as string) ?? "",
    snapshot_at: (row.snapshot_at as number | null) ?? null,
    notes: (row.notes as string) ?? "",
    on_bookmark_bar: (row.on_bookmark_bar as number) === 1,
  };
}

export function getBookmarkTags(bookmarkId: number): string[] {
  return runQuery<{ tag: string }>("SELECT tag FROM bookmark_tags WHERE bookmark_id = ?", [
    bookmarkId,
  ]).map((r) => r.tag);
}

export type BookmarkIconMode = "favicon" | "letter";

function parseBookmarkMeta(raw: string | undefined | null): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function buildMetaJson(
  existingJson: string | undefined | null,
  meta: { keywords: string[]; articleTags: string[] }
): string {
  const prev = parseBookmarkMeta(existingJson);
  const next: Record<string, unknown> = {
    keywords: meta.keywords,
    articleTags: meta.articleTags,
  };
  if (prev.icon === "letter") next.icon = "letter";
  return JSON.stringify(next);
}

export function setBookmarkIconMode(bookmarkId: number, mode: BookmarkIconMode): boolean {
  const bookmark = getBookmarkById(bookmarkId);
  if (!bookmark) return false;
  const meta = parseBookmarkMeta(bookmark.meta_json);
  if (mode === "letter") {
    meta.icon = "letter";
  } else {
    delete meta.icon;
  }
  runExec("UPDATE bookmarks SET meta_json = ? WHERE id = ?", [JSON.stringify(meta), bookmarkId]);
  saveDatabase();
  return true;
}

export function setBookmarkTags(bookmarkId: number, tags: string[]): void {
  runExec("DELETE FROM bookmark_tags WHERE bookmark_id = ?", [bookmarkId]);
  for (const tag of tags) {
    const t = tag.trim().toLowerCase();
    if (t) runExec("INSERT INTO bookmark_tags (bookmark_id, tag) VALUES (?, ?)", [bookmarkId, t]);
  }
  runExec("UPDATE bookmarks SET tags = ? WHERE id = ?", [tags.join(","), bookmarkId]);
  saveDatabase();
}

export function getBookmarkById(id: number): Bookmark | null {
  const rows = runQuery<Record<string, unknown>>("SELECT * FROM bookmarks WHERE id = ?", [id]);
  if (!rows[0]) return null;
  const b = rowToBookmark(rows[0]);
  b.tags = getBookmarkTags(id).join(",");
  return b;
}

export function getBookmarkByUrl(url: string): Bookmark | null {
  const rows = runQuery<Record<string, unknown>>("SELECT * FROM bookmarks WHERE url = ?", [url]);
  if (!rows[0]) return null;
  const b = rowToBookmark(rows[0]);
  b.tags = getBookmarkTags(b.id).join(",");
  return b;
}

export interface ImportBookmarkItem {
  url: string;
  title: string;
  onBar?: boolean;
}

export interface ImportBookmarksResult {
  imported: number;
  updated: number;
  skipped: number;
  parsed?: number;
}

export interface ImportBookmarkItem {
  url: string;
  title: string;
  onBar?: boolean;
}

export interface ImportBookmarksResult {
  imported: number;
  updated: number;
  skipped: number;
  parsed?: number;
}

export function importBookmarks(
  items: ImportBookmarkItem[],
  barTree?: ImportBarNode[]
): ImportBookmarksResult {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const wsId = getDefaultWorkspaceId();
  let layoutIndex = countWorkspacePins(wsId);

  for (const item of items) {
    const url = item.url?.trim();
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      skipped++;
      continue;
    }

    const title = item.title?.trim() || url;
    const existing = getBookmarkByUrl(url);
    if (existing) {
      if (!isBookmarkPinned(wsId, existing.id)) {
        pinBookmarkAtLayoutIndex(wsId, existing.id, layoutIndex++);
      }
      updated++;
      continue;
    }

    addBookmark(url, title);
    pinBookmarkAtLayoutIndex(wsId, getBookmarkByUrl(url)!.id, layoutIndex++);
    imported++;
  }

  if (barTree && barTree.length > 0) {
    importBarTree(barTree, true);
  } else {
    const barItems = items.filter((i) => i.onBar);
    if (barItems.length > 0) {
      const nodes: ImportBarNode[] = barItems.map((i) => ({
        type: "bookmark" as const,
        url: i.url,
        title: i.title,
      }));
      importBarTree(nodes, true);
    }
  }

  return { imported, updated, skipped };
}

export function addBookmark(url: string, title: string, contentId: number | null = null): Bookmark {
  const now = Date.now();
  runExec(
    `INSERT OR REPLACE INTO bookmarks (url, title, content_id, created_at, tags) VALUES (?, ?, ?, ?, ?)`,
    [url, title, contentId, now, ""]
  );
  saveDatabase();
  return getBookmarkByUrl(url)!;
}

export async function saveBookmarkFromTab(
  tabId: string,
  opts: SaveBookmarkOptions = {}
): Promise<{ ok: boolean; bookmark?: Bookmark; error?: string }> {
  const wc = tabManager.getWebContents(tabId);
  if (!wc || wc.isDestroyed()) {
    return { ok: false, error: "No page to save" };
  }

  const url = wc.getURL();
  if (!url || url.startsWith("inix://") || url.startsWith("about:")) {
    return { ok: false, error: "Cannot bookmark this page" };
  }

  try {
    const { meta, faviconPath } = await captureFromTab(tabId);
    const { cleanTitle, tags: titleTags } = parseTagsFromTitle(meta.title);
    const allTags = extractAutoTags(meta, [...(opts.userTags ?? []), ...titleTags]);

    const existing = getBookmarkByUrl(url);
    let bookmarkId: number;

    if (existing) {
      bookmarkId = existing.id;
      runExec(
        `UPDATE bookmarks SET title = ?, description = ?, og_title = ?, og_image = ?,
         meta_json = ?, favicon_path = ?, content_id = COALESCE(content_id, ?) WHERE id = ?`,
        [
          cleanTitle || meta.title,
          meta.description,
          meta.ogTitle,
          meta.ogImage,
          buildMetaJson(existing.meta_json, {
            keywords: meta.keywords,
            articleTags: meta.articleTags,
          }),
          bookmarkId,
        ]
      );
    } else {
      const contentId = findContentIdForUrl(url);
      runExec(
        `INSERT INTO bookmarks (url, title, content_id, created_at, tags, description, og_title, og_image,
         meta_json, favicon_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          url,
          cleanTitle || meta.title,
          contentId,
          Date.now(),
          "",
          meta.description,
          meta.ogTitle,
          meta.ogImage,
          JSON.stringify({ keywords: meta.keywords, articleTags: meta.articleTags }),
          faviconPath,
        ]
      );
      bookmarkId = lastInsertId();
    }

    setBookmarkTags(bookmarkId, allTags);

    if (getSettings().bookmark_bar_enabled) {
      if (opts.barParentId !== undefined || opts.barInsertIndex !== undefined) {
        addBookmarkNode(bookmarkId, opts.barParentId ?? null, opts.barInsertIndex);
      } else {
        appendBookmarkToBarRoot(bookmarkId);
      }
    }

    const snapshot = await saveArchiveSnapshot(wc, bookmarkId);
    if (snapshot) {
      runExec("UPDATE bookmarks SET snapshot_path = ?, snapshot_at = ? WHERE id = ?", [
        snapshot.snapshotPath,
        snapshot.snapshotAt,
        bookmarkId,
      ]);
      saveDatabase();
    }

    let text = meta.description || meta.ogDescription || "";
    try {
      const extracted = (await wc.executeJavaScript(EXTRACT_PAGE_SCRIPT)) as { text: string };
      text = extracted.text || text;
    } catch {
      // use description fallback
    }

    if (text.trim()) {
      queueEmbedding(bookmarkId, "bookmark", bookmarkId, url, cleanTitle || meta.title, Date.now(), text);
    }

    const wsId = opts.workspaceId ?? getDefaultWorkspaceId();
    if (opts.pinX != null && opts.pinY != null) {
      setPin(wsId, bookmarkId, opts.pinX, opts.pinY);
    } else {
      pinBookmarkAtCenter(wsId, bookmarkId);
    }

    const bookmark = getBookmarkById(bookmarkId)!;
    return { ok: true, bookmark };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

function findContentIdForUrl(url: string): number | null {
  const rows = runQuery<{ id: number }>(
    "SELECT id FROM page_content WHERE url = ? ORDER BY captured_at DESC LIMIT 1",
    [url]
  );
  return rows[0]?.id ?? null;
}

export function removeBookmark(url: string): void {
  const b = getBookmarkByUrl(url);
  if (!b) return;
  if (b.snapshot_path && fs.existsSync(b.snapshot_path)) {
    try {
      fs.unlinkSync(b.snapshot_path);
    } catch {
      // ignore
    }
  }
  runExec("DELETE FROM bookmarks WHERE url = ?", [url]);
  saveDatabase();
}

export function clearAllBookmarks(): void {
  const rows = runQuery<{ snapshot_path: string }>(
    "SELECT snapshot_path FROM bookmarks WHERE snapshot_path IS NOT NULL AND snapshot_path != ''"
  );
  for (const row of rows) {
    if (row.snapshot_path && fs.existsSync(row.snapshot_path)) {
      try {
        fs.unlinkSync(row.snapshot_path);
      } catch {
        // ignore
      }
    }
  }
  runExec("DELETE FROM bookmark_bar_nodes");
  runExec("DELETE FROM workspace_pins");
  runExec("DELETE FROM bookmark_tags");
  runExec("DELETE FROM bookmarks");
  runExec("DELETE FROM embeddings WHERE source_type = 'bookmark'");
  saveDatabase();
}

export function listBookmarks(filter: BookmarkFilter = {}): Bookmark[] {
  let sql = "SELECT DISTINCT b.* FROM bookmarks b";
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (filter.tags?.length) {
    sql += " JOIN bookmark_tags bt ON bt.bookmark_id = b.id";
    const placeholders = filter.tags.map(() => "?").join(", ");
    conditions.push(`bt.tag IN (${placeholders})`);
    params.push(...filter.tags.map((t) => t.toLowerCase()));
  }

  if (filter.workspaceId != null) {
    sql += " JOIN workspace_pins wp ON wp.bookmark_id = b.id";
    conditions.push("wp.workspace_id = ?");
    params.push(filter.workspaceId);
  }

  if (filter.query?.trim()) {
    conditions.push("(b.title LIKE ? OR b.url LIKE ? OR b.description LIKE ?)");
    const q = `%${filter.query.trim()}%`;
    params.push(q, q, q);
  }

  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY b.created_at DESC";

  const rows = runQuery<Record<string, unknown>>(sql, params);
  return rows.map((row) => {
    const b = rowToBookmark(row);
    b.tags = getBookmarkTags(b.id).join(",");
    return b;
  });
}

export function isBookmarked(url: string): boolean {
  const rows = runQuery<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM bookmarks WHERE url = ?", [url]);
  return (rows[0]?.cnt ?? 0) > 0;
}

export function openArchive(bookmarkId: number): string | null {
  const b = getBookmarkById(bookmarkId);
  if (!b?.snapshot_path || !fs.existsSync(b.snapshot_path)) return null;
  return `inix://archive/${bookmarkId}`;
}

export function getFaviconDataUrl(faviconPath: string): string | null {
  if (!faviconPath || !fs.existsSync(faviconPath)) return null;
  try {
    const buf = fs.readFileSync(faviconPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export function listBarBookmarks(): Bookmark[] {
  const rows = runQuery<Record<string, unknown>>(
    "SELECT * FROM bookmarks WHERE on_bookmark_bar = 1 ORDER BY title COLLATE NOCASE ASC"
  );
  return rows.map((row) => {
    const b = rowToBookmark(row);
    b.tags = getBookmarkTags(b.id).join(",");
    return b;
  });
}

export function setBookmarkOnBar(bookmarkId: number, onBar: boolean): boolean {
  const b = getBookmarkById(bookmarkId);
  if (!b) return false;
  if (onBar) {
    addBookmarkNode(bookmarkId, null);
  } else {
    const nodes = runQuery<{ id: number }>(
      "SELECT id FROM bookmark_bar_nodes WHERE type = 'bookmark' AND bookmark_id = ?",
      [bookmarkId]
    );
    for (const node of nodes) {
      deleteNode(node.id);
    }
    syncBookmarkBarFlagOnly(bookmarkId, false);
  }
  return true;
}

function syncBookmarkBarFlagOnly(bookmarkId: number, onBar: boolean): void {
  runExec("UPDATE bookmarks SET on_bookmark_bar = ? WHERE id = ?", [onBar ? 1 : 0, bookmarkId]);
  saveDatabase();
}

export function addCurrentUrlToBar(url: string): boolean {
  const b = getBookmarkByUrl(url);
  if (!b) return false;
  return addBookmarkNode(b.id, null) != null;
}
