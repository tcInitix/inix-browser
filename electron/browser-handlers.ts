import { ipcMain, BrowserWindow } from "electron";
import { tabManager } from "./tab-manager";
import {
  listDownloads,
  cancelDownload,
  openDownload,
  clearCompletedDownloads,
} from "./downloads/manager";
import {
  respondToPermission,
  revokeAllPermissions,
  listPermissionGrants,
  revokePermissionGrant,
  revokeAllPermissionsForOrigin,
} from "./permissions";
import { clearBrowsingData, getStorageUsage, listSites, clearSiteData } from "./site-data";
import { extractPageInMain } from "./storage/page-extractor";

export function registerBrowserHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle("find:start", (_e, tabId: string, text: string, forward = true) =>
    tabManager.findInPage(tabId, text, forward)
  );
  ipcMain.handle("find:stop", (_e, tabId: string) => tabManager.stopFind(tabId));

  ipcMain.handle("browser:zoom-in", (_e, tabId: string) => tabManager.zoomIn(tabId));
  ipcMain.handle("browser:zoom-out", (_e, tabId: string) => tabManager.zoomOut(tabId));
  ipcMain.handle("browser:zoom-reset", (_e, tabId: string) => tabManager.zoomReset(tabId));
  ipcMain.handle("browser:get-zoom", (_e, tabId: string) => tabManager.getZoom(tabId));

  ipcMain.handle("browser:devtools", (_e, tabId: string) => tabManager.toggleDevTools(tabId));
  ipcMain.handle("browser:print", (_e, tabId: string) => tabManager.print(tabId));

  ipcMain.handle("window:fullscreen", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    tabManager.setChromeHidden(win, next);
    win.webContents.send("window:fullscreen-changed", next);
    return next;
  });

  ipcMain.handle("window:is-fullscreen", () => {
    const win = getWindow();
    return win?.isFullScreen() ?? false;
  });

  ipcMain.handle("browser:reader", async (_e, tabId: string) => {
    const wc = tabManager.getWebContents(tabId);
    if (!wc || wc.isDestroyed()) return null;
    try {
      const html = await wc.executeJavaScript("document.documentElement.outerHTML");
      const url = wc.getURL();
      const extracted = extractPageInMain(html, url);
      if (!extracted.text.trim()) return null;
      return extracted;
    } catch {
      return null;
    }
  });

  ipcMain.handle("downloads:list", () => listDownloads());
  ipcMain.handle("downloads:cancel", (_e, id: string) => cancelDownload(id));
  ipcMain.handle("downloads:open", (_e, id: string) => openDownload(id));
  ipcMain.handle("downloads:clear", () => {
    clearCompletedDownloads();
    return true;
  });

  ipcMain.handle("permission:respond", (_e, id: string, allow: boolean) =>
    respondToPermission(id, allow)
  );

  ipcMain.handle("site-data:clear", async (_e, opts: Parameters<typeof clearBrowsingData>[0]) => {
    if (opts.cookies) revokeAllPermissions();
    await clearBrowsingData(opts);
  });
  ipcMain.handle("site-data:usage", () => getStorageUsage());
  ipcMain.handle("site-data:list", () => listSites());
  ipcMain.handle(
    "site-data:clear-origin",
    (_e, origin: string, opts?: Parameters<typeof clearSiteData>[1]) => clearSiteData(origin, opts ?? {})
  );

  ipcMain.handle("permission:list", () => listPermissionGrants());
  ipcMain.handle("permission:revoke", (_e, partition: string, origin: string, permission: string) =>
    revokePermissionGrant(partition, origin, permission)
  );
  ipcMain.handle("permission:revoke-origin", (_e, partition: string, origin: string) =>
    revokeAllPermissionsForOrigin(partition, origin)
  );
}
