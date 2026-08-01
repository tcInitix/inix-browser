import { runQuery, runExec, lastInsertId, saveDatabase } from "./db";
import type { Bookmark } from "./bookmarks";

export interface Workspace {
  id: number;
  name: string;
  viewport_x: number;
  viewport_y: number;
  zoom: number;
  created_at: number;
  updated_at: number;
}

export interface WorkspacePin {
  workspace_id: number;
  bookmark_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
}

export interface CanvasBookmark extends Bookmark {
  pin_x: number;
  pin_y: number;
  pin_width: number;
  pin_height: number;
  pin_z: number;
}

export interface WorkspaceCanvas {
  workspace: Workspace;
  pins: CanvasBookmark[];
}

export function listWorkspaces(): Workspace[] {
  return runQuery<Workspace>("SELECT * FROM workspaces ORDER BY created_at ASC");
}

export function getDefaultWorkspaceId(): number {
  const rows = runQuery<{ id: number }>("SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1");
  return rows[0]?.id ?? 1;
}

export function createWorkspace(name: string): Workspace {
  const now = Date.now();
  runExec(
    "INSERT INTO workspaces (name, viewport_x, viewport_y, zoom, created_at, updated_at) VALUES (?, 0, 0, 1, ?, ?)",
    [name, now, now]
  );
  const id = lastInsertId();
  saveDatabase();
  return runQuery<Workspace>("SELECT * FROM workspaces WHERE id = ?", [id])[0]!;
}

export function renameWorkspace(id: number, name: string): void {
  runExec("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?", [name, Date.now(), id]);
  saveDatabase();
}

export function deleteWorkspace(id: number): void {
  const all = listWorkspaces();
  if (all.length <= 1) return;
  runExec("DELETE FROM workspaces WHERE id = ?", [id]);
  saveDatabase();
}

export function setViewport(id: number, x: number, y: number, zoom: number): void {
  runExec("UPDATE workspaces SET viewport_x = ?, viewport_y = ?, zoom = ?, updated_at = ? WHERE id = ?", [
    x,
    y,
    zoom,
    Date.now(),
    id,
  ]);
  saveDatabase();
}

export function setPin(
  workspaceId: number,
  bookmarkId: number,
  x: number,
  y: number,
  width = 240,
  height = 120,
  zIndex = 0
): void {
  runExec(
    `INSERT OR REPLACE INTO workspace_pins (workspace_id, bookmark_id, x, y, width, height, z_index)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [workspaceId, bookmarkId, x, y, width, height, zIndex]
  );
  saveDatabase();
}

export function removePin(workspaceId: number, bookmarkId: number): void {
  runExec("DELETE FROM workspace_pins WHERE workspace_id = ? AND bookmark_id = ?", [
    workspaceId,
    bookmarkId,
  ]);
  saveDatabase();
}

export function getWorkspaceCanvas(workspaceId: number): WorkspaceCanvas {
  const workspace = runQuery<Workspace>("SELECT * FROM workspaces WHERE id = ?", [workspaceId])[0];
  if (!workspace) throw new Error("Workspace not found");

  const pins = runQuery<CanvasBookmark>(
    `SELECT b.*, p.x AS pin_x, p.y AS pin_y, p.width AS pin_width, p.height AS pin_height, p.z_index AS pin_z
     FROM workspace_pins p
     JOIN bookmarks b ON b.id = p.bookmark_id
     WHERE p.workspace_id = ?
     ORDER BY p.z_index ASC`,
    [workspaceId]
  );

  for (const pin of pins) {
    const tagList = getTagsForBookmark(pin.id);
    pin.tags = tagList.join(",");
  }

  return { workspace, pins };
}

function getTagsForBookmark(bookmarkId: number): string[] {
  return runQuery<{ tag: string }>("SELECT tag FROM bookmark_tags WHERE bookmark_id = ?", [
    bookmarkId,
  ]).map((r) => r.tag);
}

export function pinBookmarkAtCenter(workspaceId: number, bookmarkId: number): void {
  setPin(workspaceId, bookmarkId, 120, 120, 240, 120, Date.now() % 1000);
}

export function getAllTags(): string[] {
  return runQuery<{ tag: string }>(
    "SELECT DISTINCT tag FROM bookmark_tags ORDER BY tag ASC"
  ).map((r) => r.tag);
}
