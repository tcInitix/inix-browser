import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export function getArchivesDir(): string {
  const dir = path.join(app.getPath("userData"), "archives");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getFaviconsDir(): string {
  const dir = path.join(app.getPath("userData"), "favicons");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function archivePathForBookmark(bookmarkId: number): string {
  return path.join(getArchivesDir(), `${bookmarkId}.mhtml`);
}

export function faviconPathForHash(hash: string): string {
  return path.join(getFaviconsDir(), `${hash}.png`);
}
