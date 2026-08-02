import { getBookmarkById } from "./bookmarks";
import { getArchiveLoadUrl } from "./archive-service";

export function isSettingsShellUrl(url: string): boolean {
  return url.split("#")[0]?.split("?")[0] === "inix://settings";
}

export function resolveInixUrl(url: string): string | null {
  if (url === "inix://library") return url;
  if (isSettingsShellUrl(url)) return url.split("#")[0];
  if (!url.startsWith("inix://archive/")) return null;
  const idStr = url.replace("inix://archive/", "").split("/")[0];
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return null;
  const bookmark = getBookmarkById(id);
  if (!bookmark?.snapshot_path) return null;
  return getArchiveLoadUrl(id, bookmark.snapshot_path);
}

export function isInixInternalUrl(url: string): boolean {
  return url.startsWith("inix://");
}
