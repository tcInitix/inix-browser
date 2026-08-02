import { runQuery, runExec, lastInsertId, saveDatabase, getDb } from "./db";
import { getSetting } from "./settings";
import { tabManager } from "../tab-manager";
import { isVaultUnlocked, saveVaultEntry } from "./vault";

export type HistoryTier = "standard" | "transient" | "vaulted";

export interface HistoryEntry {
  id: number;
  url: string;
  title: string;
  visited_at: number;
  content_id: number | null;
  tier: HistoryTier;
  session_id: string | null;
}

const CAPTURE_TTL_MS = 5 * 60 * 1000;
let ftsAvailable = true;

export function shouldCapture(url: string): boolean {
  if (!url || url.startsWith("inix://") || url.startsWith("about:") || url.startsWith("chrome:")) {
    return false;
  }
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function wasRecentlyCaptured(url: string): boolean {
  const cutoff = Date.now() - CAPTURE_TTL_MS;
  const rows = runQuery<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM page_content WHERE url = ? AND captured_at > ?",
    [url, cutoff]
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

export function getDefaultHistoryTier(isPrivate: boolean): HistoryTier {
  if (isPrivate) return "transient";
  const mode = getSetting("history_mode") || "standard";
  if (mode === "transient" || mode === "vaulted" || mode === "standard") return mode;
  return "standard";
}

export function recordLightVisit(tabId: string, url: string, title: string): number | null {
  if (tabManager.isHistorySuppressed(tabId)) return null;
  if (tabManager.isPrivate(tabId)) return null;
  if (!shouldCapture(url)) return null;

  const tier = getDefaultHistoryTier(false);
  if (tier === "vaulted") {
    if (!isVaultUnlocked()) return null;
    saveVaultEntry({ url, title, visited_at: Date.now() });
    return null;
  }

  return recordVisit(url, title, null, tier);
}

export function savePageContent(url: string, title: string, text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  runExec(
    "INSERT INTO page_content (url, title, text, word_count, captured_at) VALUES (?, ?, ?, ?, ?)",
    [url, title, text, wordCount, Date.now()]
  );
  const id = lastInsertId();
  saveDatabase();
  return id;
}

export function recordVisit(
  url: string,
  title: string,
  contentId: number | null,
  tier: HistoryTier = "standard",
  sessionId: string | null = null
): number {
  runExec(
    "INSERT INTO history (url, title, visited_at, content_id, tier, session_id) VALUES (?, ?, ?, ?, ?, ?)",
    [url, title, Date.now(), contentId, tier, sessionId]
  );
  const id = lastInsertId();
  syncFtsRow(id, title, url, contentId);
  saveDatabase();
  return id;
}

function getPageText(contentId: number | null): string {
  if (!contentId) return "";
  const rows = runQuery<{ text: string }>("SELECT text FROM page_content WHERE id = ?", [contentId]);
  return rows[0]?.text ?? "";
}

function syncFtsRow(historyId: number, title: string, url: string, contentId: number | null): void {
  if (!ftsAvailable) return;
  try {
    const body = getPageText(contentId);
    runExec("DELETE FROM history_fts WHERE history_id = ?", [historyId]);
    runExec(
      "INSERT INTO history_fts (history_id, title, url, body) VALUES (?, ?, ?, ?)",
      [historyId, title, url, body]
    );
  } catch {
    ftsAvailable = false;
  }
}

export function updateHistoryContent(historyId: number, contentId: number): void {
  runExec("UPDATE history SET content_id = ? WHERE id = ?", [contentId, historyId]);
  const rows = runQuery<{ title: string; url: string }>(
    "SELECT title, url FROM history WHERE id = ?",
    [historyId]
  );
  const row = rows[0];
  if (row) syncFtsRow(historyId, row.title, row.url, contentId);
  saveDatabase();
}

export function linkCaptureToRecentVisit(url: string, contentId: number, tier: HistoryTier): number {
  const rows = runQuery<{ id: number }>(
    "SELECT id FROM history WHERE url = ? AND tier = ? ORDER BY visited_at DESC LIMIT 1",
    [url, tier]
  );
  if (rows[0]) {
    updateHistoryContent(rows[0].id, contentId);
    return rows[0].id;
  }
  const rows2 = runQuery<{ title: string }>("SELECT title FROM page_content WHERE id = ?", [contentId]);
  return recordVisit(url, rows2[0]?.title ?? url, contentId, tier);
}

export function getRecentHistory(limit = 50, tier?: HistoryTier, query?: string): HistoryEntry[] {
  if (query?.trim()) {
    return searchHistoryFts(query.trim(), tier, limit);
  }

  if (tier) {
    return runQuery<HistoryEntry>(
      "SELECT id, url, title, visited_at, content_id, tier, session_id FROM history WHERE tier = ? ORDER BY visited_at DESC LIMIT ?",
      [tier, limit]
    );
  }

  return runQuery<HistoryEntry>(
    "SELECT id, url, title, visited_at, content_id, tier, session_id FROM history WHERE tier != 'vaulted' ORDER BY visited_at DESC LIMIT ?",
    [limit]
  );
}

export function searchHistoryFts(query: string, tier?: HistoryTier, limit = 20): HistoryEntry[] {
  if (ftsAvailable) {
    try {
      let sql = `
        SELECT h.id, h.url, h.title, h.visited_at, h.content_id, h.tier, h.session_id
        FROM history_fts f
        JOIN history h ON h.id = f.history_id
        WHERE history_fts MATCH ?
      `;
      const params: (string | number)[] = [query.replace(/"/g, '""')];
      if (tier) {
        sql += " AND h.tier = ?";
        params.push(tier);
      } else {
        sql += " AND h.tier != 'vaulted'";
      }
      sql += " ORDER BY h.visited_at DESC LIMIT ?";
      params.push(limit);
      return runQuery<HistoryEntry>(sql, params);
    } catch {
      ftsAvailable = false;
    }
  }
  return searchHistoryKeyword(query, limit, tier);
}

export function searchHistoryKeyword(query: string, limit = 20, tier?: HistoryTier): HistoryEntry[] {
  const pattern = `%${query}%`;
  if (tier) {
    return runQuery<HistoryEntry>(
      `SELECT h.id, h.url, h.title, h.visited_at, h.content_id, h.tier, h.session_id
       FROM history h
       LEFT JOIN page_content p ON p.id = h.content_id
       WHERE h.tier = ? AND (h.title LIKE ? OR h.url LIKE ? OR p.text LIKE ?)
       ORDER BY h.visited_at DESC LIMIT ?`,
      [tier, pattern, pattern, pattern, limit]
    );
  }
  return runQuery<HistoryEntry>(
    `SELECT h.id, h.url, h.title, h.visited_at, h.content_id, h.tier, h.session_id
     FROM history h
     LEFT JOIN page_content p ON p.id = h.content_id
     WHERE h.tier != 'vaulted' AND (h.title LIKE ? OR h.url LIKE ? OR p.text LIKE ?)
     ORDER BY h.visited_at DESC LIMIT ?`,
    [pattern, pattern, pattern, limit]
  );
}

export function clearHistory(tier?: HistoryTier): void {
  if (tier) {
    runExec("DELETE FROM history WHERE tier = ?", [tier]);
  } else {
    runExec("DELETE FROM history WHERE tier != 'vaulted'");
    runExec("DELETE FROM page_content");
    runExec("DELETE FROM embeddings");
    try {
      runExec("DELETE FROM history_fts");
    } catch {
      // fts may not exist
    }
  }
  saveDatabase();
}

export function deleteHistoryEntry(historyId: number): boolean {
  runExec("DELETE FROM history WHERE id = ?", [historyId]);
  try {
    runExec("DELETE FROM history_fts WHERE history_id = ?", [historyId]);
  } catch {
    // fts may be unavailable
  }
  saveDatabase();
  return true;
}

export function moveHistoryToVault(historyId: number): boolean {
  runExec("DELETE FROM history WHERE id = ?", [historyId]);
  try {
    runExec("DELETE FROM history_fts WHERE history_id = ?", [historyId]);
  } catch {
    // fts may be unavailable
  }
  saveDatabase();
  return true;
}

export function purgeTransientHistory(): number {
  const hours = parseInt(getSetting("transient_retention_hours") || "24", 10);
  const cutoff = Date.now() - (Number.isFinite(hours) ? hours : 24) * 3600_000;
  runExec("DELETE FROM history WHERE tier = 'transient' AND visited_at < ?", [cutoff]);
  saveDatabase();
  return cutoff;
}

export function purgeAllTransient(): void {
  runExec("DELETE FROM history WHERE tier = 'transient'");
  saveDatabase();
}

export function getPageContentById(id: number): { text: string; url: string; title: string } | null {
  const rows = runQuery<{ text: string; url: string; title: string }>(
    "SELECT text, url, title FROM page_content WHERE id = ?",
    [id]
  );
  return rows[0] ?? null;
}

export function rebuildFtsIndex(): void {
  if (!ftsAvailable) return;
  try {
    runExec("DELETE FROM history_fts");
    const rows = runQuery<{ id: number; title: string; url: string; content_id: number | null }>(
      "SELECT id, title, url, content_id FROM history"
    );
    for (const row of rows) {
      syncFtsRow(row.id, row.title, row.url, row.content_id);
    }
    saveDatabase();
  } catch {
    ftsAvailable = false;
  }
}

export function isFtsAvailable(): boolean {
  return ftsAvailable;
}

export function initFtsAvailability(): void {
  try {
    getDb().exec("SELECT COUNT(*) FROM history_fts");
  } catch {
    ftsAvailable = false;
  }
}
