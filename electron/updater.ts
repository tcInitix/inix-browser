import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { BrowserWindow } from "electron";
import {
  friendlyUpdateError,
  fetchGithubReleaseBody,
  normalizeReleaseNotes,
} from "./updater-text";

let getWindow: (() => BrowserWindow | null) | null = null;

const GITHUB_OWNER = "tcInitix";
const GITHUB_REPO = "inix-browser";

function send(channel: string, payload?: unknown): void {
  getWindow?.()?.webContents.send(channel, payload);
}

/** Background update checks fail quietly when there is no release yet or the network is down. */
function isSilentUpdateError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("no published versions") ||
    m.includes("404") ||
    m.includes("net::") ||
    m.includes("network") ||
    m.includes("enotfound") ||
    m.includes("econnrefused") ||
    m.includes("latest.yml") ||
    m.includes("unable to find latest version") ||
    m.includes('"statuscode"') ||
    m.includes("createhttperror")
  );
}

async function resolveReleaseNotes(version: string, fromUpdater: unknown): Promise<string | undefined> {
  const direct = normalizeReleaseNotes(fromUpdater);
  if (direct) return direct;
  return fetchGithubReleaseBody(GITHUB_OWNER, GITHUB_REPO, version);
}

export function initAutoUpdater(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter;

  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-available", (info) => {
    void (async () => {
      const releaseNotes = await resolveReleaseNotes(info.version, info.releaseNotes);
      send("update:available", {
        version: info.version,
        releaseNotes: releaseNotes ?? "",
      });
    })();
  });

  autoUpdater.on("update-not-available", () => {
    send("update:not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    send("update:progress", { percent: progress.percent });
  });

  autoUpdater.on("update-downloaded", (info) => {
    send("update:ready", { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    if (isSilentUpdateError(err.message)) return;
    console.warn("[updater]", err.message.slice(0, 200));
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => {});
  }, 12_000);

  setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

export function getAppVersion(): string {
  return app.getVersion();
}

export function isUpdateSupported(): boolean {
  return app.isPackaged;
}

export async function checkForUpdatesManual(): Promise<{ ok: boolean; error?: string }> {
  if (!app.isPackaged) {
    return { ok: false, error: "Updates are only checked in the installed app (.exe), not in dev mode." };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    const message = friendlyUpdateError(err);
    if (!message || isSilentUpdateError(message)) {
      return { ok: true };
    }
    return { ok: false, error: message };
  }
}

export async function downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyUpdateError(err) };
  }
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}
