import { ipcMain, BrowserWindow } from "electron";
import {
  saveBookmarkFromTab,
  removeBookmark,
  clearAllBookmarks,
  listBookmarks,
  getBookmarkById,
  isBookmarked,
  openArchive,
  setBookmarkTags,
  getBookmarkTags,
  getFaviconDataUrl,
  addBookmark,
  listBarBookmarks,
  setBookmarkOnBar,
  addCurrentUrlToBar,
  setBookmarkIconMode,
  type BookmarkFilter,
  type SaveBookmarkOptions,
  type BookmarkIconMode,
} from "./bookmarks";
import { listAliases, setAlias, removeAlias, resolveAlias, aliasesAsMap, seedDefaultAliases } from "./aliases";
import {
  listWorkspaces,
  createWorkspace,
  renameWorkspace,
  deleteWorkspace,
  getWorkspaceCanvas,
  setPin,
  removePin,
  setViewport,
  getAllTags,
  getDefaultWorkspaceId,
} from "./workspaces";
import { getSettings, setSetting, getAllSettings } from "./settings";
import {
  clearHistory,
  deleteHistoryEntry,
  getRecentHistory,
  moveHistoryToVault,
  getPageContentById,
} from "./history";
import { runQuery } from "./db";
import type { HistoryEntry } from "./history";
import {
  isVaultConfigured,
  isVaultUnlocked,
  setupVault,
  unlockVault,
  lockVault,
  changeVaultPassword,
  listVaultEntries,
  moveHistoryEntryToVault,
  clearVaultHistory,
  removeVaultEntry,
} from "./vault";
import { rebuildIndex } from "./vector-index";
import { rebuildFtsIndex } from "./history";
import { searchSemantic, searchRecent } from "./search";
import { resetAiEngine } from "../ai/ai-engine";
import {
  getBarTree,
  createFolder,
  renameFolder,
  deleteNode,
  moveNode,
  addBookmarkNode,
  addUrlToBarTree,
  importBarTree,
  type ImportBarNode,
} from "./bookmark-bar";
import { getSettings as getFormattedSettings, syncStartupSettings } from "./settings";
import { pickDownloadFolder, resolveDownloadDir } from "../downloads/manager";
import { factoryResetApp } from "./app-reset";
import { exportEncrypted, importEncrypted } from "./export-import";

export function registerStorageHandlers(): void {
  ipcMain.handle("bookmarks:save-from-tab", async (_e, tabId: string, opts?: SaveBookmarkOptions) =>
    saveBookmarkFromTab(tabId, opts)
  );
  ipcMain.handle("bookmarks:remove", (_e, url: string) => {
    removeBookmark(url);
    return true;
  });
  ipcMain.handle("bookmarks:clear-all", () => {
    clearAllBookmarks();
    return true;
  });
  ipcMain.handle("bookmarks:list", (_e, filter?: BookmarkFilter) => listBookmarks(filter ?? {}));
  ipcMain.handle("bookmarks:get", (_e, id: number) => getBookmarkById(id));
  ipcMain.handle("bookmarks:check", (_e, url: string) => isBookmarked(url));
  ipcMain.handle("bookmarks:open-archive", (_e, id: number) => openArchive(id));
  ipcMain.handle("bookmarks:set-tags", (_e, id: number, tags: string[]) => {
    setBookmarkTags(id, tags);
    return true;
  });
  ipcMain.handle("bookmarks:get-tags", (_e, id: number) => getBookmarkTags(id));
  ipcMain.handle("bookmarks:favicon", (_e, path: string) => getFaviconDataUrl(path));
  ipcMain.handle("bookmarks:set-icon-mode", (_e, id: number, mode: BookmarkIconMode) =>
    setBookmarkIconMode(id, mode)
  );
  ipcMain.handle("bookmarks:all-tags", () => getAllTags());
  ipcMain.handle("bookmarks:list-bar", () => listBarBookmarks());
  ipcMain.handle("bookmarks:set-bar", (_e, id: number, onBar: boolean) =>
    setBookmarkOnBar(id, onBar)
  );
  ipcMain.handle("bookmarks:add-url-to-bar", (_e, url: string) => addCurrentUrlToBar(url));

  ipcMain.handle("bookmarks:list-bar-tree", () => getBarTree());
  ipcMain.handle("bookmarks:bar-create-folder", (_e, title: string, parentId?: number | null) =>
    createFolder(title, parentId ?? null)
  );
  ipcMain.handle("bookmarks:bar-rename-folder", (_e, nodeId: number, title: string) =>
    renameFolder(nodeId, title)
  );
  ipcMain.handle("bookmarks:bar-delete-node", (_e, nodeId: number) => deleteNode(nodeId));
  ipcMain.handle("bookmarks:bar-move-node", (_e, nodeId: number, parentId: number | null, index: number) =>
    moveNode(nodeId, parentId, index)
  );
  ipcMain.handle(
    "bookmarks:bar-add-bookmark",
    (_e, bookmarkId: number, parentId?: number | null, insertIndex?: number) =>
      addBookmarkNode(bookmarkId, parentId ?? null, insertIndex)
  );
  ipcMain.handle(
    "bookmarks:bar-add-url",
    (_e, url: string, parentId?: number | null, insertIndex?: number) =>
      addUrlToBarTree(url, parentId ?? null, insertIndex)
  );
  ipcMain.handle("bookmarks:bar-import-tree", (_e, nodes: ImportBarNode[], replace?: boolean) => {
    importBarTree(nodes, replace !== false);
    return true;
  });

  ipcMain.handle("aliases:list", () => listAliases());
  ipcMain.handle("aliases:set", (_e, alias: string, url: string, title?: string) =>
    setAlias(alias, url, title ?? "")
  );
  ipcMain.handle("aliases:remove", (_e, alias: string) => {
    removeAlias(alias);
    return true;
  });
  ipcMain.handle("aliases:resolve", (_e, input: string) => resolveAlias(input));
  ipcMain.handle("aliases:map", () => aliasesAsMap());

  ipcMain.handle("workspaces:list", () => listWorkspaces());
  ipcMain.handle("workspaces:create", (_e, name: string) => createWorkspace(name));
  ipcMain.handle("workspaces:rename", (_e, id: number, name: string) => {
    renameWorkspace(id, name);
    return true;
  });
  ipcMain.handle("workspaces:delete", (_e, id: number) => {
    deleteWorkspace(id);
    return true;
  });
  ipcMain.handle("workspaces:default-id", () => getDefaultWorkspaceId());
  ipcMain.handle("workspaces:get-canvas", (_e, id: number) => getWorkspaceCanvas(id));
  ipcMain.handle(
    "workspaces:set-pin",
    (_e, wsId: number, bookmarkId: number, x: number, y: number, w?: number, h?: number, z?: number) => {
      setPin(wsId, bookmarkId, x, y, w, h, z);
      return true;
    }
  );
  ipcMain.handle("workspaces:remove-pin", (_e, wsId: number, bookmarkId: number) => {
    removePin(wsId, bookmarkId);
    return true;
  });
  ipcMain.handle("workspaces:set-viewport", (_e, id: number, x: number, y: number, zoom: number) => {
    setViewport(id, x, y, zoom);
    return true;
  });

  // Legacy storage handlers
  ipcMain.handle("storage:bookmark-add", (_e, url: string, title: string, contentId?: number) =>
    addBookmark(url, title, contentId ?? null)
  );
  ipcMain.handle("storage:bookmark-remove", (_e, url: string) => {
    removeBookmark(url);
    return true;
  });
  ipcMain.handle("storage:bookmark-list", () => listBookmarks());
  ipcMain.handle("storage:bookmark-check", (_e, url: string) => isBookmarked(url));
  ipcMain.handle(
    "storage:history-list",
    (_e, opts?: { limit?: number; tier?: string; query?: string }) =>
      getRecentHistory(opts?.limit, opts?.tier as "standard" | "transient" | "vaulted" | undefined, opts?.query)
  );
  ipcMain.handle("storage:history-clear", (_e, tier?: string) => {
    clearHistory(tier as "standard" | "transient" | "vaulted" | undefined);
    return true;
  });
  ipcMain.handle("storage:history-delete", (_e, historyId: number) => {
    deleteHistoryEntry(historyId);
    return true;
  });
  ipcMain.handle("storage:history-move-to-vault", (_e, historyId: number) => {
    if (!isVaultUnlocked()) return { ok: false, error: "Vault locked" };
    const rows = runQuery<HistoryEntry>(
      "SELECT id, url, title, visited_at, content_id, tier, session_id FROM history WHERE id = ?",
      [historyId]
    );
    const entry = rows[0];
    if (!entry) return { ok: false, error: "Entry not found" };
    const content = entry.content_id ? getPageContentById(entry.content_id) : null;
    moveHistoryEntryToVault(entry.url, entry.title, entry.visited_at, content?.text);
    moveHistoryToVault(historyId);
    return { ok: true };
  });

  ipcMain.handle("vault:is-configured", () => isVaultConfigured());
  ipcMain.handle("vault:is-unlocked", () => isVaultUnlocked());
  ipcMain.handle("vault:setup", (_e, password: string) => setupVault(password));
  ipcMain.handle("vault:unlock", (_e, password: string) => unlockVault(password));
  ipcMain.handle("vault:lock", () => {
    lockVault();
    return true;
  });
  ipcMain.handle("vault:change-password", (_e, oldPw: string, newPw: string) =>
    changeVaultPassword(oldPw, newPw)
  );
  ipcMain.handle("vault:list", (_e, limit?: number) => listVaultEntries(limit));
  ipcMain.handle("vault:delete-entry", (_e, id: number) => {
    if (!isVaultUnlocked()) return { ok: false, error: "Vault locked" };
    removeVaultEntry(id);
    return { ok: true };
  });
  ipcMain.handle("vault:clear-history", () => {
    if (!isVaultUnlocked()) return { ok: false, error: "Vault locked" };
    clearVaultHistory();
    return { ok: true };
  });

  ipcMain.handle("settings:get", () => getAllSettings());
  ipcMain.handle("settings:set", (_e, key: string, value: string) => {
    setSetting(key, value);
    if (key === "startup_mode") {
      const mode = value as "restore" | "new_tab" | "homepage" | "urls";
      syncStartupSettings(mode);
    }
    if (
      key === "engine_host" ||
      key === "ollama_host" ||
      key === "chat_model" ||
      key === "embed_model" ||
      key === "ai_provider" ||
      key === "api_base_url" ||
      key === "api_key" ||
      key === "api_model"
    ) {
      resetAiEngine();
      if (key === "engine_host" || key === "ollama_host") {
        seedDefaultAliases(getSettings().engine_host);
      }
    }
    return true;
  });
  ipcMain.handle("settings:rebuild-index", () => {
    rebuildIndex();
    rebuildFtsIndex();
    return true;
  });
  ipcMain.handle("settings:get-formatted", () => getFormattedSettings());
  ipcMain.handle("settings:pick-download-folder", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return pickDownloadFolder(win && !win.isDestroyed() ? win : null);
  });
  ipcMain.handle("settings:default-download-path", () => resolveDownloadDir());

  ipcMain.handle("search:semantic", (_e, query: string, limit?: number) =>
    searchSemantic(query, limit)
  );
  ipcMain.handle("search:recent", (_e, limit?: number) => searchRecent(limit));

  ipcMain.handle("app:factory-reset", async () => {
    await factoryResetApp();
    return true;
  });

  ipcMain.handle("backup:export", async (e, passphrase: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return exportEncrypted(win && !win.isDestroyed() ? win : null, passphrase);
  });
  ipcMain.handle("backup:import", async (e, passphrase: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return importEncrypted(win && !win.isDestroyed() ? win : null, passphrase);
  });
}

export function initStorageDefaults(): void {
  seedDefaultAliases(getSettings().engine_host);
}
