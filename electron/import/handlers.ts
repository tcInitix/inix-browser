import { ipcMain, dialog, BrowserWindow, app, type IpcMainInvokeEvent } from "electron";
import { importChromeBookmarksFromFile, importChromeBookmarksFromProfile } from "./chrome-bookmarks";
import {
  importChromePasswordsFromProfile,
  importPasswordsFromCsvFile,
} from "./chrome-passwords";
import { getChromeUserDataDir, listChromeProfiles } from "./chrome-paths";

function windowFromEvent(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerImportHandlers(): void {
  ipcMain.handle("import:chrome-profiles", () => ({
    userDataDir: getChromeUserDataDir(),
    profiles: listChromeProfiles(),
  }));

  ipcMain.handle("import:chrome-bookmarks", (_e, profileDir?: string) => {
    try {
      const dir = profileDir ?? listChromeProfiles()[0]?.dir;
      if (!dir) {
        return { ok: false, error: "Chrome not found on this device." };
      }
      const result = importChromeBookmarksFromProfile(dir);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("import:pick-chrome-bookmarks", async (e) => {
    const win = windowFromEvent(e);
    const opts = {
      title: "Import Chrome bookmarks",
      defaultPath: app.getPath("downloads"),
      filters: [
        { name: "Chrome bookmarks export", extensions: ["html", "htm"] },
        { name: "Chrome profile Bookmarks", extensions: ["json"] },
        { name: "All files", extensions: ["*"] },
      ],
      properties: ["openFile"] as ("openFile")[],
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    try {
      const imported = importChromeBookmarksFromFile(result.filePaths[0]);
      return { ok: true, ...imported };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("import:chrome-passwords", async (_e, profileDir?: string) => {
    try {
      const dir = profileDir ?? listChromeProfiles()[0]?.dir;
      if (!dir) {
        return { ok: false, error: "Chrome not found on this device." };
      }
      const result = await importChromePasswordsFromProfile(dir);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("import:pick-chrome-passwords-csv", async (e) => {
    const win = windowFromEvent(e);
    const opts = {
      title: "Select Chrome password export (CSV)",
      filters: [
        { name: "CSV", extensions: ["csv"] },
        { name: "All files", extensions: ["*"] },
      ],
      properties: ["openFile"] as ("openFile")[],
    };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    try {
      const imported = importPasswordsFromCsvFile(result.filePaths[0]);
      return { ok: true, ...imported };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
