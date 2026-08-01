import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

export interface TabUpdate {
  tabId: string;
  title?: string;
  url?: string;
  isLoading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  error?: string;
  frozen?: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface EngineStatus {
  connected: boolean;
  provider: "local" | "api";
  models: string[];
  chatModel: string;
  embedModel: string;
  host: string;
  error?: string;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  visited_at: number;
  score: number;
}

contextBridge.exposeInMainWorld("inix", {
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    toggleFullscreen: () => ipcRenderer.invoke("window:fullscreen") as Promise<boolean>,
    isFullscreen: () => ipcRenderer.invoke("window:is-fullscreen") as Promise<boolean>,
    onFullscreenChanged: (callback: (fullscreen: boolean) => void) => {
      const handler = (_e: IpcRendererEvent, fullscreen: boolean) => callback(fullscreen);
      ipcRenderer.on("window:fullscreen-changed", handler);
      return () => ipcRenderer.removeListener("window:fullscreen-changed", handler);
    },
    getMode: () => ipcRenderer.invoke("window:get-mode") as Promise<{ privateWindow: boolean }>,
    openPrivate: () => ipcRenderer.invoke("window:open-private") as Promise<boolean>,
  },
  browser: {
    createTab: (tabId: string, isPrivate?: boolean) => ipcRenderer.invoke("tab:create", tabId, isPrivate),
    destroyTab: (tabId: string) => ipcRenderer.invoke("tab:destroy", tabId),
    showTab: (tabId: string) => ipcRenderer.invoke("tab:show", tabId),
    hide: () => ipcRenderer.invoke("tab:hide"),
    navigate: (tabId: string, url: string) => ipcRenderer.invoke("tab:navigate", tabId, url),
    goBack: (tabId: string) => ipcRenderer.invoke("tab:back", tabId),
    goForward: (tabId: string) => ipcRenderer.invoke("tab:forward", tabId),
    reload: (tabId: string) => ipcRenderer.invoke("tab:reload", tabId),
    freezeTab: (tabId: string) => ipcRenderer.invoke("tab:freeze", tabId),
    ensureActive: (tabId: string, url: string, isPrivate?: boolean) =>
      ipcRenderer.invoke("tab:ensure-active", tabId, url, isPrivate),
    getTabUrl: (tabId: string) => ipcRenderer.invoke("tab:get-url", tabId) as Promise<string>,
    canUseTabContent: (tabId: string) =>
      ipcRenderer.invoke("tab:can-use-content", tabId) as Promise<boolean>,
    onUpdated: (callback: (update: TabUpdate) => void) => {
      const handler = (_e: IpcRendererEvent, update: TabUpdate) => callback(update);
      ipcRenderer.on("tab:updated", handler);
      return () => ipcRenderer.removeListener("tab:updated", handler);
    },
    onOpenChild: (callback: (payload: { parentTabId: string; url: string }) => void) => {
      const handler = (_e: IpcRendererEvent, payload: { parentTabId: string; url: string }) =>
        callback(payload);
      ipcRenderer.on("tab:open-child", handler);
      return () => ipcRenderer.removeListener("tab:open-child", handler);
    },
    zoomIn: (tabId: string) => ipcRenderer.invoke("browser:zoom-in", tabId),
    zoomOut: (tabId: string) => ipcRenderer.invoke("browser:zoom-out", tabId),
    zoomReset: (tabId: string) => ipcRenderer.invoke("browser:zoom-reset", tabId),
    getZoom: (tabId: string) => ipcRenderer.invoke("browser:get-zoom", tabId),
    toggleDevTools: (tabId: string) => ipcRenderer.invoke("browser:devtools", tabId),
    print: (tabId: string) => ipcRenderer.invoke("browser:print", tabId),
    getReaderContent: (tabId: string) =>
      ipcRenderer.invoke("browser:reader", tabId) as Promise<{ title: string; url: string; text: string } | null>,
    panicSync: (urls: string[]) =>
      ipcRenderer.invoke("panic:sync", urls) as Promise<
        Array<{ tabId: string; url: string; title: string; isLoading: boolean }>
      >,
    panicActivate: () => ipcRenderer.invoke("panic:activate") as Promise<void>,
    panicDeactivate: (urls: string[]) => ipcRenderer.invoke("panic:deactivate", urls) as Promise<void>,
  },
  find: {
    start: (tabId: string, text: string, forward?: boolean) =>
      ipcRenderer.invoke("find:start", tabId, text, forward ?? true),
    stop: (tabId: string) => ipcRenderer.invoke("find:stop", tabId),
    onResult: (callback: (result: { tabId: string; activeMatchOrdinal: number; matches: number }) => void) => {
      const handler = (
        _e: IpcRendererEvent,
        result: { tabId: string; activeMatchOrdinal: number; matches: number }
      ) => callback(result);
      ipcRenderer.on("find:result", handler);
      return () => ipcRenderer.removeListener("find:result", handler);
    },
  },
  downloads: {
    list: () => ipcRenderer.invoke("downloads:list"),
    cancel: (id: string) => ipcRenderer.invoke("downloads:cancel", id),
    open: (id: string) => ipcRenderer.invoke("downloads:open", id),
    clear: () => ipcRenderer.invoke("downloads:clear"),
    onUpdated: (callback: (record: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, record: unknown) => callback(record);
      ipcRenderer.on("download:updated", handler);
      return () => ipcRenderer.removeListener("download:updated", handler);
    },
  },
  permission: {
    respond: (id: string, allow: boolean) => ipcRenderer.invoke("permission:respond", id, allow),
    onRequest: (
      callback: (req: { id: string; permission: string; requestingUrl: string }) => void
    ) => {
      const handler = (
        _e: IpcRendererEvent,
        req: { id: string; permission: string; requestingUrl: string }
      ) => callback(req);
      ipcRenderer.on("permission:request", handler);
      return () => ipcRenderer.removeListener("permission:request", handler);
    },
    onDismiss: (callback: (payload: { id: string }) => void) => {
      const handler = (_e: IpcRendererEvent, payload: { id: string }) => callback(payload);
      ipcRenderer.on("permission:dismiss", handler);
      return () => ipcRenderer.removeListener("permission:dismiss", handler);
    },
    list: () => ipcRenderer.invoke("permission:list"),
    revoke: (partition: string, origin: string, permission: string) =>
      ipcRenderer.invoke("permission:revoke", partition, origin, permission),
    revokeOrigin: (partition: string, origin: string) =>
      ipcRenderer.invoke("permission:revoke-origin", partition, origin),
  },
  siteData: {
    clear: (opts: { cookies?: boolean; cache?: boolean; storage?: boolean; privateOnly?: boolean }) =>
      ipcRenderer.invoke("site-data:clear", opts),
    usage: () => ipcRenderer.invoke("site-data:usage") as Promise<{ partition: string; bytes: number }[]>,
    list: () => ipcRenderer.invoke("site-data:list"),
    clearOrigin: (origin: string, opts?: { cookies?: boolean; storage?: boolean; partition?: string }) =>
      ipcRenderer.invoke("site-data:clear-origin", origin, opts),
  },
  context: {
    onAction: (
      callback: (action: {
        type: string;
        url?: string;
        text?: string;
        tabId?: string;
        parentTabId?: string;
      }) => void
    ) => {
      const handler = (
        _e: IpcRendererEvent,
        action: {
          type: string;
          url?: string;
          text?: string;
          tabId?: string;
          parentTabId?: string;
        }
      ) => callback(action);
      ipcRenderer.on("context:action", handler);
      return () => ipcRenderer.removeListener("context:action", handler);
    },
  },
  session: {
    getRestore: () => ipcRenderer.invoke("session:get-restore"),
    wasCrashRestore: () => ipcRenderer.invoke("session:was-crash-restore"),
    sync: (snapshot: unknown) => ipcRenderer.invoke("session:sync", snapshot),
    flush: (cleanShutdown?: boolean) => ipcRenderer.invoke("session:flush", cleanShutdown),
  },
  sidebar: {
    setOpen: (open: boolean) => ipcRenderer.invoke("sidebar:set-open", open),
  },
  chrome: {
    setBookmarkBar: (visible: boolean) => ipcRenderer.invoke("chrome:set-bookmark-bar", visible),
  },
  update: {
    version: () => ipcRenderer.invoke("update:version") as Promise<string>,
    supported: () => ipcRenderer.invoke("update:supported") as Promise<boolean>,
    check: () => ipcRenderer.invoke("update:check") as Promise<{ ok: boolean; error?: string }>,
    download: () => ipcRenderer.invoke("update:download") as Promise<{ ok: boolean; error?: string }>,
    install: () => ipcRenderer.invoke("update:install") as Promise<boolean>,
    onAvailable: (
      callback: (info: { version: string; releaseNotes?: string }) => void
    ) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        info: { version: string; releaseNotes?: string }
      ) => callback(info);
      ipcRenderer.on("update:available", handler);
      return () => ipcRenderer.removeListener("update:available", handler);
    },
    onNotAvailable: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("update:not-available", handler);
      return () => ipcRenderer.removeListener("update:not-available", handler);
    },
    onProgress: (callback: (progress: { percent: number }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, progress: { percent: number }) =>
        callback(progress);
      ipcRenderer.on("update:progress", handler);
      return () => ipcRenderer.removeListener("update:progress", handler);
    },
    onReady: (callback: (info: { version: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
      ipcRenderer.on("update:ready", handler);
      return () => ipcRenderer.removeListener("update:ready", handler);
    },
    onError: (callback: (err: { message: string }) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, err: { message: string }) => callback(err);
      ipcRenderer.on("update:error", handler);
      return () => ipcRenderer.removeListener("update:error", handler);
    },
  },
  ai: {
    getStatus: (): Promise<EngineStatus> => ipcRenderer.invoke("ai:status"),
    chat: (tabId: string, messages: ChatMessage[], usePageContext: boolean, useWebSearch?: boolean) =>
      ipcRenderer.invoke("ai:chat", tabId, messages, usePageContext, useWebSearch ?? false),
    summarize: (tabId: string) => ipcRenderer.invoke("ai:summarize", tabId),
    explainSelection: (tabId: string) => ipcRenderer.invoke("ai:explain-selection", tabId),
    onStreamChunk: (callback: (chunk: string) => void) => {
      const handler = (_e: IpcRendererEvent, chunk: string) => callback(chunk);
      ipcRenderer.on("ai:stream-chunk", handler);
      return () => ipcRenderer.removeListener("ai:stream-chunk", handler);
    },
    onStreamDone: (callback: (content: string) => void) => {
      const handler = (_e: IpcRendererEvent, content: string) => callback(content);
      ipcRenderer.on("ai:stream-done", handler);
      return () => ipcRenderer.removeListener("ai:stream-done", handler);
    },
    onStreamError: (callback: (error: string) => void) => {
      const handler = (_e: IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on("ai:stream-error", handler);
      return () => ipcRenderer.removeListener("ai:stream-error", handler);
    },
    onWebSearchStart: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("ai:web-search-start", handler);
      return () => ipcRenderer.removeListener("ai:web-search-start", handler);
    },
    onWebSearchDone: (callback: (status: string, detail: string) => void) => {
      const handler = (_e: IpcRendererEvent, status: string, detail: string) => callback(status, detail);
      ipcRenderer.on("ai:web-search-done", handler);
      return () => ipcRenderer.removeListener("ai:web-search-done", handler);
    },
  },
  search: {
    semantic: (query: string, limit?: number): Promise<SearchResult[]> =>
      ipcRenderer.invoke("search:semantic", query, limit),
    recent: (limit?: number) => ipcRenderer.invoke("search:recent", limit),
  },
  storage: {
    bookmarkAdd: (url: string, title: string, contentId?: number) =>
      ipcRenderer.invoke("storage:bookmark-add", url, title, contentId),
    bookmarkRemove: (url: string) => ipcRenderer.invoke("storage:bookmark-remove", url),
    bookmarkList: () => ipcRenderer.invoke("storage:bookmark-list"),
    bookmarkCheck: (url: string) => ipcRenderer.invoke("storage:bookmark-check", url),
    historyList: (opts?: { limit?: number; tier?: string; query?: string }) =>
      ipcRenderer.invoke("storage:history-list", opts),
    historyClear: (tier?: string) => ipcRenderer.invoke("storage:history-clear", tier),
    historyMoveToVault: (historyId: number) =>
      ipcRenderer.invoke("storage:history-move-to-vault", historyId),
  },
  vault: {
    isConfigured: () => ipcRenderer.invoke("vault:is-configured"),
    isUnlocked: () => ipcRenderer.invoke("vault:is-unlocked"),
    setup: (password: string) => ipcRenderer.invoke("vault:setup", password),
    unlock: (password: string) => ipcRenderer.invoke("vault:unlock", password),
    lock: () => ipcRenderer.invoke("vault:lock"),
    changePassword: (oldPassword: string, newPassword: string) =>
      ipcRenderer.invoke("vault:change-password", oldPassword, newPassword),
    list: (limit?: number) => ipcRenderer.invoke("vault:list", limit),
  },
  bookmarks: {
    saveFromTab: (tabId: string, opts?: { userTags?: string[]; workspaceId?: number }) =>
      ipcRenderer.invoke("bookmarks:save-from-tab", tabId, opts),
    remove: (url: string) => ipcRenderer.invoke("bookmarks:remove", url),
    list: (filter?: { tags?: string[]; workspaceId?: number; query?: string }) =>
      ipcRenderer.invoke("bookmarks:list", filter),
    get: (id: number) => ipcRenderer.invoke("bookmarks:get", id),
    check: (url: string) => ipcRenderer.invoke("bookmarks:check", url),
    openArchive: (id: number) => ipcRenderer.invoke("bookmarks:open-archive", id),
    setTags: (id: number, tags: string[]) => ipcRenderer.invoke("bookmarks:set-tags", id, tags),
    allTags: () => ipcRenderer.invoke("bookmarks:all-tags"),
    favicon: (path: string) => ipcRenderer.invoke("bookmarks:favicon", path),
    listBar: () => ipcRenderer.invoke("bookmarks:list-bar"),
    setBar: (id: number, onBar: boolean) => ipcRenderer.invoke("bookmarks:set-bar", id, onBar),
    addUrlToBar: (url: string) => ipcRenderer.invoke("bookmarks:add-url-to-bar", url),
  },
  aliases: {
    list: () => ipcRenderer.invoke("aliases:list"),
    set: (alias: string, url: string, title?: string) =>
      ipcRenderer.invoke("aliases:set", alias, url, title),
    remove: (alias: string) => ipcRenderer.invoke("aliases:remove", alias),
    resolve: (input: string) => ipcRenderer.invoke("aliases:resolve", input),
    map: () => ipcRenderer.invoke("aliases:map"),
  },
  workspaces: {
    list: () => ipcRenderer.invoke("workspaces:list"),
    create: (name: string) => ipcRenderer.invoke("workspaces:create", name),
    rename: (id: number, name: string) => ipcRenderer.invoke("workspaces:rename", id, name),
    delete: (id: number) => ipcRenderer.invoke("workspaces:delete", id),
    defaultId: () => ipcRenderer.invoke("workspaces:default-id"),
    getCanvas: (id: number) => ipcRenderer.invoke("workspaces:get-canvas", id),
    setPin: (wsId: number, bookmarkId: number, x: number, y: number, w?: number, h?: number, z?: number) =>
      ipcRenderer.invoke("workspaces:set-pin", wsId, bookmarkId, x, y, w, h, z),
    removePin: (wsId: number, bookmarkId: number) =>
      ipcRenderer.invoke("workspaces:remove-pin", wsId, bookmarkId),
    setViewport: (id: number, x: number, y: number, zoom: number) =>
      ipcRenderer.invoke("workspaces:set-viewport", id, x, y, zoom),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value),
    getFormatted: () => ipcRenderer.invoke("settings:get-formatted"),
    rebuildIndex: () => ipcRenderer.invoke("settings:rebuild-index"),
  },
  shortcuts: {
    onAction: (callback: (action: string) => void) => {
      const handler = (_e: IpcRendererEvent, action: string) => callback(action);
      ipcRenderer.on("shortcut:action", handler);
      return () => ipcRenderer.removeListener("shortcut:action", handler);
    },
  },
  credentials: {
    list: () => ipcRenderer.invoke("credentials:list"),
    remove: (id: number) => ipcRenderer.invoke("credentials:remove", id),
  },
  autofill: {
    saveCredential: (payload: {
      origin: string;
      username: string;
      password: string;
      title: string;
    }) => ipcRenderer.invoke("autofill:save-credential", payload),
    onSaveOffer: (callback: (offer: {
      origin: string;
      username: string;
      password: string;
      title: string;
      tabId?: string;
    }) => void) => {
      const handler = (
        _e: IpcRendererEvent,
        offer: { origin: string; username: string; password: string; title: string; tabId?: string }
      ) => callback(offer);
      ipcRenderer.on("autofill:save-offer", handler);
      return () => ipcRenderer.removeListener("autofill:save-offer", handler);
    },
    profiles: () => ipcRenderer.invoke("autofill:profiles"),
    profileData: (id: number) => ipcRenderer.invoke("autofill:profile-data", id),
    createProfile: (label: string) => ipcRenderer.invoke("autofill:create-profile", label),
    updateProfile: (id: number, label: string, data: Record<string, string>) =>
      ipcRenderer.invoke("autofill:update-profile", id, label, data),
    setDefault: (id: number) => ipcRenderer.invoke("autofill:set-default", id),
    removeProfile: (id: number) => ipcRenderer.invoke("autofill:remove-profile", id),
  },
  profiles: {
    list: () => ipcRenderer.invoke("profiles:list"),
    create: (name: string, color?: string) => ipcRenderer.invoke("profiles:create", name, color),
    rename: (id: string, name: string) => ipcRenderer.invoke("profiles:rename", id, name),
    delete: (id: string) => ipcRenderer.invoke("profiles:delete", id),
    openWindow: (id: string) => ipcRenderer.invoke("profiles:open-window", id),
  },
  import: {
    chromeProfiles: () => ipcRenderer.invoke("import:chrome-profiles"),
    chromeBookmarks: (profileDir?: string) =>
      ipcRenderer.invoke("import:chrome-bookmarks", profileDir),
    pickChromeBookmarks: () => ipcRenderer.invoke("import:pick-chrome-bookmarks"),
    chromePasswords: (profileDir?: string) =>
      ipcRenderer.invoke("import:chrome-passwords", profileDir),
    pickChromePasswordsCsv: () => ipcRenderer.invoke("import:pick-chrome-passwords-csv"),
  },
});
