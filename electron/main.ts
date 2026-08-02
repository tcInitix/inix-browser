import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { configureDevEnvironment } from "./dev-env";

configureDevEnvironment();
import { tabManager, setupBrowsingSession } from "./tab-manager";
import { matchShortcut } from "./shortcuts";
import { initDatabase } from "./storage/db";
import { registerAiHandlers } from "./ai/handlers";
import { canUseTabContent } from "./ai/context";
import { registerStorageHandlers, initStorageDefaults } from "./storage/handlers";
import { registerSessionHandlers } from "./session/handlers";
import { sessionManager } from "./session/session-manager";
import { startTabFreezer, stopTabFreezer } from "./session/tab-freezer";
import {
  startHistoryPurgeScheduler,
  stopHistoryPurgeScheduler,
  purgeOnAppClose,
} from "./storage/history-purge";
import { initFtsAvailability } from "./storage/history";
import { onAppQuitVault } from "./storage/vault";
import { initDownloads } from "./downloads/manager";
import { clearBrowsingData } from "./site-data";
import { initPermissionHandler } from "./permissions";
import { initContextMenus } from "./context-menu";
import { registerBrowserHandlers } from "./browser-handlers";
import { registerAutofillHandlers } from "./autofill/handlers";
import { registerImportHandlers } from "./import/handlers";
import { getSettings } from "./storage/settings";
import {
  DEFAULT_PROFILE_ID,
  getWindowProfileId,
  setWindowProfileId,
} from "./profiles/manager";
import {
  initAutoUpdater,
  getAppVersion,
  isUpdateSupported,
  checkForUpdatesManual,
  downloadUpdate,
  installUpdate,
  setUpdateInstallHook,
  isQuittingForUpdate,
} from "./updater";

declare global {
  // eslint-disable-next-line no-var
  var __inixMainBootstrapped: boolean | undefined;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
const privateWindowIds = new Set<number>();

if (gotSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function winFromEvent(e: IpcMainInvokeEvent | { sender: Electron.WebContents }): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender);
}

function wireMainWindow(win: BrowserWindow, isPrivateWindow = false, profileId = DEFAULT_PROFILE_ID) {
  const tagged = win as BrowserWindow & {
    __inixWired?: boolean;
    __inixPrivateWindow?: boolean;
    __inixProfileId?: string;
  };
  if (tagged.__inixWired) return;
  tagged.__inixWired = true;
  tagged.__inixPrivateWindow = isPrivateWindow;
  setWindowProfileId(win, profileId);

  if (isPrivateWindow) privateWindowIds.add(win.id);

  tabManager.attachWindow(win);

  tabManager.setNewTabHandler((ownerWin, parentTabId, url) => {
    ownerWin.webContents.send("tab:open-child", { parentTabId, url });
  });

  win.webContents.on("before-input-event", (event, input) => {
    const action = matchShortcut(input);
    if (action) {
      event.preventDefault();
      win.webContents.send("shortcut:action", action);
    }
  });

  win.webContents.on("render-process-gone", () => {
    sessionManager.flush(false);
  });

  win.on("close", () => {
    sessionManager.flush(true);
  });

  win.once("closed", () => {
    privateWindowIds.delete(win.id);
    if (mainWindow === win) mainWindow = null;
  });

  const syncFullscreen = (fullscreen: boolean) => {
    tabManager.setChromeHidden(win, fullscreen);
    win.webContents.send("window:fullscreen-changed", fullscreen);
  };

  win.on("enter-full-screen", () => syncFullscreen(true));
  win.on("leave-full-screen", () => syncFullscreen(false));
}

function createWindow(isPrivateWindow = false, profileId = DEFAULT_PROFILE_ID) {
  if (
    !isPrivateWindow &&
    profileId === DEFAULT_PROFILE_ID &&
    mainWindow &&
    !mainWindow.isDestroyed()
  ) {
    mainWindow.focus();
    return mainWindow;
  }

  if (!isPrivateWindow && profileId === DEFAULT_PROFILE_ID) {
    const existing = BrowserWindow.getAllWindows().find(
      (w) =>
        !w.isDestroyed() &&
        !privateWindowIds.has(w.id) &&
        getWindowProfileId(w) === DEFAULT_PROFILE_ID
    );
    if (existing) {
      mainWindow = existing;
      wireMainWindow(mainWindow);
      return mainWindow;
    }
  }

  const iconPath = path.join(
    __dirname,
    process.env.VITE_DEV_SERVER_URL ? "../public/icon.png" : "../dist/icon.png"
  );

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0a0a0f",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (!isPrivateWindow) mainWindow = win;

  wireMainWindow(win, isPrivateWindow, profileId);

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  return win;
}

function registerMainIpcHandlers() {
  ipcMain.on("window:minimize", (e) => winFromEvent(e)?.minimize());
  ipcMain.on("window:maximize", (e) => {
    const win = winFromEvent(e);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on("window:close", (e) => winFromEvent(e)?.close());

  ipcMain.handle("window:get-mode", (e) => {
    const win = winFromEvent(e);
    const tagged = win as BrowserWindow & { __inixPrivateWindow?: boolean };
    return {
      privateWindow: !!(win && (tagged.__inixPrivateWindow || privateWindowIds.has(win.id))),
      profileId: win ? getWindowProfileId(win) : DEFAULT_PROFILE_ID,
    };
  });

  ipcMain.handle("window:open-private", () => {
    createWindow(true);
    return true;
  });

  ipcMain.handle("tab:create", (e, tabId: string, isPrivate?: boolean) => {
    const win = winFromEvent(e);
    if (win) tabManager.createTab(win, tabId, isPrivate ?? false);
  });
  ipcMain.handle("tab:destroy", (_e, tabId: string) => tabManager.destroyTab(tabId));
  ipcMain.handle("tab:show", (e, tabId: string) => {
    const win = winFromEvent(e);
    if (win) tabManager.showTab(win, tabId);
  });
  ipcMain.handle("tab:hide", (e) => {
    const win = winFromEvent(e);
    if (win) tabManager.hide(win);
  });
  ipcMain.handle("tab:navigate", (e, tabId: string, url: string) => {
    const win = winFromEvent(e);
    if (win) return tabManager.navigate(win, tabId, url);
  });
  ipcMain.handle("tab:back", (_e, tabId: string) => tabManager.goBack(tabId));
  ipcMain.handle("tab:forward", (_e, tabId: string) => tabManager.goForward(tabId));
  ipcMain.handle("tab:reload", (_e, tabId: string) => tabManager.reload(tabId));
  ipcMain.handle("tab:freeze", (_e, tabId: string) => tabManager.freezeTab(tabId));
  ipcMain.handle("tab:ensure-active", (e, tabId: string, url: string, isPrivate?: boolean) => {
    const win = winFromEvent(e);
    if (win) return tabManager.ensureActive(win, tabId, url, isPrivate ?? false);
  });
  ipcMain.handle("tab:get-url", (_e, tabId: string) => tabManager.getTabUrl(tabId));
  ipcMain.handle("tab:can-use-content", (_e, tabId: string) => canUseTabContent(tabId));
  ipcMain.handle("sidebar:set-open", (e, open: boolean) => {
    const win = winFromEvent(e);
    if (win) tabManager.setSidebarOpen(win, open);
  });
  ipcMain.handle("chrome:set-bookmark-bar", (_e, visible: boolean) => {
    tabManager.setBookmarkBarVisible(visible);
    return true;
  });

  ipcMain.handle("panic:sync", (e, urls: string[]) => {
    const win = winFromEvent(e);
    if (!win) return [];
    return tabManager.syncPanicPreload(win, urls);
  });
  ipcMain.handle("panic:activate", (e) => {
    const win = winFromEvent(e);
    if (win) tabManager.activatePanicPreload(win);
  });
  ipcMain.handle("panic:deactivate", (e, urls: string[]) => {
    const win = winFromEvent(e);
    if (!win) return;
    return tabManager.deactivatePanicPreload(win, urls);
  });

  ipcMain.handle("update:version", () => getAppVersion());
  ipcMain.handle("update:supported", () => isUpdateSupported());
  ipcMain.handle("update:check", () => checkForUpdatesManual());
  ipcMain.handle("update:download", () => downloadUpdate());
  ipcMain.handle("update:install", () => {
    installUpdate();
    return true;
  });
}

async function bootstrap() {
  if (!global.__inixMainBootstrapped) {
    global.__inixMainBootstrapped = true;
    await initDatabase();
    initFtsAvailability();
    sessionManager.init();
    setupBrowsingSession();
    initStorageDefaults();
    registerStorageHandlers();
    registerImportHandlers();
    registerSessionHandlers();
    registerAiHandlers(() => mainWindow);
    registerBrowserHandlers(() => mainWindow);
    initDownloads(() => mainWindow);
    initPermissionHandler(() => mainWindow);
    initContextMenus(() => mainWindow);
    registerAutofillHandlers((pid) => createWindow(false, pid));
    startHistoryPurgeScheduler();
    startTabFreezer();
    registerMainIpcHandlers();
    initAutoUpdater(() => mainWindow);
    setUpdateInstallHook(() => {
      tabManager.shutdownForUpdate();
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.isDestroyed()) continue;
        win.removeAllListeners("close");
      }
    });
  }

  createWindow();

  tabManager.setBookmarkBarVisible(getSettings().bookmark_bar_enabled);
}

if (gotSingleInstanceLock) {
  app.whenReady().then(() => bootstrap());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("before-quit", () => {
    if (isQuittingForUpdate()) return;
    const settings = getSettings();
    if (settings.clear_cookies_on_exit) {
      void clearBrowsingData({ cookies: true, storage: true });
    }
    if (settings.clear_cache_on_exit) {
      void clearBrowsingData({ cache: true });
    }
    purgeOnAppClose();
    sessionManager.flush(true);
    stopTabFreezer();
    stopHistoryPurgeScheduler();
    onAppQuitVault();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && !isQuittingForUpdate()) {
      app.quit();
    }
  });
}
