/**
 * Minimal PWA-style "Create app shortcut" scaffold.
 *
 * This does NOT install the site as a true system-registered PWA
 * (that requires per-OS shortcut plumbing + protocol handlers).
 * It just persists the site metadata so the browser can offer a
 * dedicated top-level window for it, similar to Chrome's
 * "Install site as app" / "Create shortcut".
 *
 * Wire this up when we later add a "Create shortcut…" menu item.
 */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface WebApp {
  id: string;
  url: string;
  name: string;
  icon?: string;
  createdAt: number;
}

function storePath(): string {
  return path.join(app.getPath("userData"), "web-apps.json");
}

function readStore(): WebApp[] {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WebApp[]) : [];
  } catch {
    return [];
  }
}

function writeStore(apps: WebApp[]): void {
  try {
    fs.writeFileSync(storePath(), JSON.stringify(apps, null, 2), "utf8");
  } catch {
    // ignore — non-fatal
  }
}

export function listWebApps(): WebApp[] {
  return readStore();
}

export function addWebApp(url: string, name: string, icon?: string): WebApp {
  const apps = readStore();
  const id = `app-${Date.now()}`;
  const rec: WebApp = { id, url, name, icon, createdAt: Date.now() };
  apps.push(rec);
  writeStore(apps);
  return rec;
}

export function removeWebApp(id: string): void {
  const apps = readStore().filter((a) => a.id !== id);
  writeStore(apps);
}
