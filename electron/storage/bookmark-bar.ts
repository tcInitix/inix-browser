import { runQuery, runExec, lastInsertId, saveDatabase } from "./db";
import { getBookmarkById, getBookmarkByUrl, type Bookmark } from "./bookmarks";

export type BarNode =
  | { id: number; type: "folder"; title: string; children: BarNode[] }
  | { id: number; type: "bookmark"; bookmark: Bookmark };

interface BarRow {
  id: number;
  parent_id: number | null;
  type: string;
  bookmark_id: number | null;
  title: string | null;
  sort_order: number;
  created_at: number;
}

export type ImportBarNode =
  | { type: "folder"; title: string; children: ImportBarNode[] }
  | { type: "bookmark"; url: string; title: string };

function syncBookmarkBarFlag(bookmarkId: number, onBar: boolean): void {
  runExec("UPDATE bookmarks SET on_bookmark_bar = ? WHERE id = ?", [onBar ? 1 : 0, bookmarkId]);
}

function hasBarNodeForBookmark(bookmarkId: number): boolean {
  const rows = runQuery<{ cnt: number }>(
    "SELECT COUNT(*) AS cnt FROM bookmark_bar_nodes WHERE type = 'bookmark' AND bookmark_id = ?",
    [bookmarkId]
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

function refreshBookmarkBarFlags(): void {
  runExec("UPDATE bookmarks SET on_bookmark_bar = 0");
  runExec(`
    UPDATE bookmarks SET on_bookmark_bar = 1
    WHERE id IN (SELECT bookmark_id FROM bookmark_bar_nodes WHERE type = 'bookmark' AND bookmark_id IS NOT NULL)
  `);
}

function getChildren(parentId: number | null): BarRow[] {
  if (parentId == null) {
    return runQuery<BarRow>(
      "SELECT * FROM bookmark_bar_nodes WHERE parent_id IS NULL ORDER BY sort_order ASC, id ASC"
    );
  }
  return runQuery<BarRow>(
    "SELECT * FROM bookmark_bar_nodes WHERE parent_id = ? ORDER BY sort_order ASC, id ASC",
    [parentId]
  );
}

function buildTree(parentId: number | null): BarNode[] {
  return getChildren(parentId).map((row) => {
    if (row.type === "folder") {
      return {
        id: row.id,
        type: "folder" as const,
        title: row.title?.trim() || "Folder",
        children: buildTree(row.id),
      };
    }
    const bookmark = getBookmarkById(row.bookmark_id!);
    if (!bookmark) {
      return {
        id: row.id,
        type: "folder" as const,
        title: "(missing)",
        children: [],
      };
    }
    return { id: row.id, type: "bookmark" as const, bookmark };
  }).filter((node) => {
    if (node.type === "folder" && node.title === "(missing)") return false;
    return true;
  });
}

function nextSortOrder(parentId: number | null): number {
  const rows = runQuery<{ max_order: number | null }>(
    parentId == null
      ? "SELECT MAX(sort_order) AS max_order FROM bookmark_bar_nodes WHERE parent_id IS NULL"
      : "SELECT MAX(sort_order) AS max_order FROM bookmark_bar_nodes WHERE parent_id = ?",
    parentId == null ? [] : [parentId]
  );
  return ((rows[0]?.max_order as number | null) ?? -1) + 1;
}

function shiftSiblingOrders(parentId: number | null, fromIndex: number, delta: number): void {
  const siblings = getChildren(parentId);
  for (const s of siblings) {
    if (s.sort_order >= fromIndex) {
      runExec("UPDATE bookmark_bar_nodes SET sort_order = ? WHERE id = ?", [s.sort_order + delta, s.id]);
    }
  }
}

function normalizeSiblingOrders(parentId: number | null): void {
  const siblings = getChildren(parentId);
  siblings.forEach((s, i) => {
    if (s.sort_order !== i) {
      runExec("UPDATE bookmark_bar_nodes SET sort_order = ? WHERE id = ?", [i, s.id]);
    }
  });
}

function getNodeRow(nodeId: number): BarRow | null {
  const rows = runQuery<BarRow>("SELECT * FROM bookmark_bar_nodes WHERE id = ?", [nodeId]);
  return rows[0] ?? null;
}

function isDescendant(ancestorId: number, nodeId: number): boolean {
  let current = getNodeRow(nodeId);
  while (current?.parent_id != null) {
    if (current.parent_id === ancestorId) return true;
    current = getNodeRow(current.parent_id);
  }
  return false;
}

export function getBarTree(): BarNode[] {
  return buildTree(null);
}

export function createFolder(title: string, parentId?: number | null): number {
  const name = title.trim() || "New folder";
  const parent = parentId ?? null;
  const order = nextSortOrder(parent);
  const now = Date.now();
  runExec(
    "INSERT INTO bookmark_bar_nodes (parent_id, type, bookmark_id, title, sort_order, created_at) VALUES (?, 'folder', NULL, ?, ?, ?)",
    [parent, name, order, now]
  );
  saveDatabase();
  return lastInsertId();
}

export function renameFolder(nodeId: number, title: string): boolean {
  const row = getNodeRow(nodeId);
  if (!row || row.type !== "folder") return false;
  runExec("UPDATE bookmark_bar_nodes SET title = ? WHERE id = ?", [title.trim() || "Folder", nodeId]);
  saveDatabase();
  return true;
}

export function deleteNode(nodeId: number): boolean {
  const row = getNodeRow(nodeId);
  if (!row) return false;

  if (row.type === "folder") {
    const children = getChildren(nodeId);
    for (const child of [...children].reverse()) {
      deleteNode(child.id);
    }
    runExec("DELETE FROM bookmark_bar_nodes WHERE id = ?", [nodeId]);
  } else if (row.bookmark_id) {
    runExec("DELETE FROM bookmark_bar_nodes WHERE id = ?", [nodeId]);
    if (!hasBarNodeForBookmark(row.bookmark_id)) {
      syncBookmarkBarFlag(row.bookmark_id, false);
    }
  }

  saveDatabase();
  return true;
}

export function addBookmarkNode(
  bookmarkId: number,
  parentId?: number | null,
  insertIndex?: number
): number | null {
  const bookmark = getBookmarkById(bookmarkId);
  if (!bookmark) return null;

  const existing = runQuery<BarRow>(
    "SELECT * FROM bookmark_bar_nodes WHERE type = 'bookmark' AND bookmark_id = ?",
    [bookmarkId]
  );
  if (existing[0]) {
    moveNode(existing[0].id, parentId ?? null, insertIndex ?? existing[0].sort_order);
    return existing[0].id;
  }

  const parent = parentId ?? null;
  const siblings = getChildren(parent);
  const index = insertIndex ?? siblings.length;
  shiftSiblingOrders(parent, index, 1);

  const now = Date.now();
  runExec(
    "INSERT INTO bookmark_bar_nodes (parent_id, type, bookmark_id, title, sort_order, created_at) VALUES (?, 'bookmark', ?, NULL, ?, ?)",
    [parent, bookmarkId, index, now]
  );
  syncBookmarkBarFlag(bookmarkId, true);
  saveDatabase();
  return lastInsertId();
}

export function addUrlToBarTree(
  url: string,
  parentId?: number | null,
  insertIndex?: number
): number | null {
  const bookmark = getBookmarkByUrl(url);
  if (!bookmark) return null;
  return addBookmarkNode(bookmark.id, parentId, insertIndex);
}

export function moveNode(nodeId: number, newParentId: number | null, insertIndex: number): boolean {
  const row = getNodeRow(nodeId);
  if (!row) return false;

  if (row.type === "folder" && newParentId != null) {
    if (newParentId === nodeId || isDescendant(nodeId, newParentId)) return false;
  }

  const oldParent = row.parent_id ?? null;
  const allOld = getChildren(oldParent);
  const fromIdx = allOld.findIndex((s) => s.id === nodeId);
  if (fromIdx === -1) return false;

  if (oldParent === newParentId) {
    const siblings = allOld.filter((s) => s.id !== nodeId);
    const target = Math.max(0, Math.min(insertIndex, siblings.length));
    siblings.splice(target, 0, row);
    siblings.forEach((s, i) => {
      runExec("UPDATE bookmark_bar_nodes SET parent_id = ?, sort_order = ? WHERE id = ?", [
        newParentId,
        i,
        s.id,
      ]);
    });
    saveDatabase();
    return true;
  }

  shiftSiblingOrders(oldParent, row.sort_order + 1, -1);
  normalizeSiblingOrders(oldParent);

  const target = Math.max(0, Math.min(insertIndex, getChildren(newParentId).length));
  shiftSiblingOrders(newParentId, target, 1);
  runExec("UPDATE bookmark_bar_nodes SET parent_id = ?, sort_order = ? WHERE id = ?", [
    newParentId,
    target,
    nodeId,
  ]);
  normalizeSiblingOrders(newParentId);
  saveDatabase();
  return true;
}

export function appendBookmarkToBarRoot(bookmarkId: number): void {
  addBookmarkNode(bookmarkId, null);
}

export function importBarTree(nodes: ImportBarNode[], replaceExisting = true): void {
  if (replaceExisting) {
    runExec("DELETE FROM bookmark_bar_nodes");
    refreshBookmarkBarFlags();
  }

  const insertNodes = (items: ImportBarNode[], parentId: number | null) => {
    items.forEach((item, index) => {
      if (item.type === "folder") {
        runExec(
          "INSERT INTO bookmark_bar_nodes (parent_id, type, bookmark_id, title, sort_order, created_at) VALUES (?, 'folder', NULL, ?, ?, ?)",
          [parentId, item.title.trim() || "Folder", index, Date.now()]
        );
        const folderId = lastInsertId();
        insertNodes(item.children, folderId);
        return;
      }
      const bookmark = getBookmarkByUrl(item.url);
      if (!bookmark) return;
      runExec(
        "INSERT INTO bookmark_bar_nodes (parent_id, type, bookmark_id, title, sort_order, created_at) VALUES (?, 'bookmark', ?, NULL, ?, ?)",
        [parentId, bookmark.id, index, Date.now()]
      );
      syncBookmarkBarFlag(bookmark.id, true);
    });
  };

  insertNodes(nodes, null);
  saveDatabase();
}

export function migrateBarNodesFromLegacyFlags(): void {
  const existing = runQuery<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM bookmark_bar_nodes");
  if ((existing[0]?.cnt ?? 0) > 0) return;

  const rows = runQuery<{ id: number; title: string }>(
    "SELECT id, title FROM bookmarks WHERE on_bookmark_bar = 1 ORDER BY title COLLATE NOCASE ASC"
  );
  rows.forEach((row, index) => {
    runExec(
      "INSERT INTO bookmark_bar_nodes (parent_id, type, bookmark_id, title, sort_order, created_at) VALUES (NULL, 'bookmark', ?, NULL, ?, ?)",
      [row.id, index, Date.now()]
    );
  });
  saveDatabase();
}

// Re-export rowToBookmark for internal use - actually getBookmarkById already handles it
