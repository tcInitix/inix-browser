import type { HistoryEntry, HistoryTier, SessionSnapshot, VaultEntry } from "./types";

export type SearchEngineId =
  | "duckduckgo"
  | "google"
  | "bing"
  | "brave"
  | "ecosia"
  | "startpage"
  | "custom";

export type StartupMode = "restore" | "new_tab" | "homepage" | "urls";
export type ThemeMode = "dark" | "light" | "system";
export type UiFontScale = "small" | "medium" | "large";
export type PermissionDefault = "ask" | "allow" | "block";

export type RelayMode = "off" | "inix-tx" | "custom";
export type RelayStatus = "off" | "connecting" | "connected" | "error";

export interface RelayState {
  status: RelayStatus;
  enabled: boolean;
  mode: RelayMode;
  region: string;
  label: string;
  exitIp: string | null;
  error: string | null;
  configured: boolean;
}

export interface InixSettings {
  ai_provider: "local" | "api";
  engine_host: string;
  chat_model: string;
  embed_model: string;
  api_base_url: string;
  api_key: string;
  api_model: string;
  capture_enabled: boolean;
  archive_enabled: boolean;
  tab_freeze_enabled: boolean;
  tab_freeze_minutes: number;
  history_mode: HistoryTier;
  transient_purge_on_close: boolean;
  transient_retention_hours: number;
  homepage_url: string;
  new_tab_use_homepage: boolean;
  restore_tabs_on_launch: boolean;
  private_mode_shortcut: "window" | "tab";
  bookmark_bar_enabled: boolean;
  panic_configured: boolean;
  panic_urls: string[];
  new_tab_quick_links: Array<{ label: string; url: string; icon?: "letter" }>;
  startup_mode: StartupMode;
  startup_urls: string[];
  default_search_engine: SearchEngineId;
  custom_search_url: string;
  theme_mode: ThemeMode;
  default_zoom_level: number;
  ui_font_scale: UiFontScale;
  tracker_blocking_enabled: boolean;
  https_only_mode: boolean;
  block_third_party_cookies: boolean;
  clear_cookies_on_exit: boolean;
  clear_cache_on_exit: boolean;
  offer_save_passwords: boolean;
  autofill_enabled: boolean;
  default_notifications: PermissionDefault;
  default_geolocation: PermissionDefault;
  default_media: PermissionDefault;
  download_path: string;
  prompt_for_download: boolean;
  close_window_with_last_tab: boolean;
  open_links_in_new_tab: boolean;
  new_tab_show_search: boolean;
  new_tab_show_quick_links: boolean;
  relay_enabled: boolean;
  relay_mode: "off" | "inix-tx" | "custom";
  relay_connect_on_startup: boolean;
  relay_custom_url: string;
}

export interface Bookmark {
  id: number;
  url: string;
  title: string;
  content_id: number | null;
  created_at: number;
  tags: string;
  description: string;
  og_title: string;
  og_image: string;
  meta_json: string;
  favicon_path: string;
  snapshot_path: string;
  snapshot_at: number | null;
  notes: string;
  on_bookmark_bar?: boolean;
}

export type BarNode =
  | { id: number; type: "folder"; title: string; children: BarNode[] }
  | { id: number; type: "bookmark"; bookmark: Bookmark };

export interface CanvasBookmark extends Bookmark {
  pin_x: number;
  pin_y: number;
  pin_width: number;
  pin_height: number;
  pin_z: number;
}

export interface Workspace {
  id: number;
  name: string;
  viewport_x: number;
  viewport_y: number;
  zoom: number;
  created_at: number;
  updated_at: number;
}

export interface WorkspaceCanvas {
  workspace: Workspace;
  pins: CanvasBookmark[];
}

export interface UrlAlias {
  alias: string;
  url: string;
  title: string;
  created_at: number;
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

export interface TabUpdate {
  tabId: string;
  title?: string;
  url?: string;
  isLoading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  error?: string;
  favicon?: string;
  frozen?: boolean;
  secure?: boolean;
  zoomLevel?: number;
  securityState?: "secure" | "insecure" | "warning" | "unknown";
  securityDetail?: string;
  audible?: boolean;
}

export interface PanicPreloadTab {
  tabId: string;
  url: string;
  title: string;
  isLoading: boolean;
}

export interface DownloadRecord {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
  startTime: number;
}

export interface PermissionRequest {
  id: string;
  permission: string;
  requestingUrl: string;
}

export interface PermissionGrant {
  partition: string;
  origin: string;
  permission: string;
}

export interface PermissionGrant {
  partition: string;
  origin: string;
  permission: string;
}

export interface StoredCredential {
  id: number;
  origin: string;
  username: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface AutofillProfileMeta {
  id: number;
  label: string;
  is_default: boolean;
  created_at: number;
}

export interface BrowserProfile {
  id: string;
  name: string;
  color: string;
  created_at: number;
}

export interface SiteRecord {
  origin: string;
  partition: string;
  cookieCount: number;
}

export interface InixAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    toggleFullscreen: () => Promise<boolean>;
    isFullscreen: () => Promise<boolean>;
    onFullscreenChanged: (callback: (fullscreen: boolean) => void) => () => void;
    getMode: () => Promise<{ privateWindow: boolean; profileId: string }>;
    openPrivate: () => Promise<boolean>;
  };
  browser: {
    createTab: (tabId: string, isPrivate?: boolean) => Promise<void>;
    destroyTab: (tabId: string) => Promise<void>;
    showTab: (tabId: string) => Promise<void>;
    hide: () => Promise<void>;
    navigate: (tabId: string, url: string) => Promise<void>;
    goBack: (tabId: string) => Promise<void>;
    goForward: (tabId: string) => Promise<void>;
    reload: (tabId: string) => Promise<void>;
    freezeTab: (tabId: string) => Promise<boolean>;
    ensureActive: (tabId: string, url: string, isPrivate?: boolean) => Promise<void>;
    getTabUrl: (tabId: string) => Promise<string>;
    canUseTabContent: (tabId: string) => Promise<boolean>;
    onUpdated: (callback: (update: TabUpdate) => void) => () => void;
    onOpenChild: (callback: (payload: { parentTabId: string; url: string }) => void) => () => void;
    zoomIn: (tabId: string) => Promise<number>;
    zoomOut: (tabId: string) => Promise<number>;
    zoomReset: (tabId: string) => Promise<number>;
    getZoom: (tabId: string) => Promise<number>;
    toggleDevTools: (tabId: string) => Promise<void>;
    print: (tabId: string) => Promise<void>;
    getReaderContent: (tabId: string) => Promise<{ title: string; url: string; text: string } | null>;
    panicSync: (urls: string[]) => Promise<PanicPreloadTab[]>;
    panicActivate: () => Promise<void>;
    panicDeactivate: (urls: string[]) => Promise<void>;
  };
  find: {
    start: (tabId: string, text: string, forward?: boolean) => Promise<number>;
    stop: (tabId: string) => Promise<void>;
    onResult: (callback: (result: { tabId: string; activeMatchOrdinal: number; matches: number }) => void) => () => void;
  };
  downloads: {
    list: () => Promise<DownloadRecord[]>;
    cancel: (id: string) => Promise<boolean>;
    open: (id: string) => Promise<boolean>;
    clear: () => Promise<boolean>;
    onUpdated: (callback: (record: DownloadRecord) => void) => () => void;
  };
  permission: {
    respond: (id: string, allow: boolean) => Promise<boolean>;
    onRequest: (callback: (req: PermissionRequest) => void) => () => void;
    onDismiss: (callback: (payload: { id: string }) => void) => () => void;
    list: () => Promise<PermissionGrant[]>;
    revoke: (partition: string, origin: string, permission: string) => Promise<boolean>;
    revokeOrigin: (partition: string, origin: string) => Promise<number>;
  };
  siteData: {
    clear: (opts: { cookies?: boolean; cache?: boolean; storage?: boolean; privateOnly?: boolean }) => Promise<void>;
    usage: () => Promise<{ partition: string; bytes: number }[]>;
    list: () => Promise<SiteRecord[]>;
    clearOrigin: (origin: string, opts?: { cookies?: boolean; storage?: boolean; partition?: string }) => Promise<void>;
  };
  context: {
    onAction: (
      callback: (action: {
        type: string;
        url?: string;
        text?: string;
        tabId?: string;
        parentTabId?: string;
      }) => void
    ) => () => void;
  };
  session: {
    getRestore: () => Promise<SessionSnapshot | null>;
    wasCrashRestore: () => Promise<boolean>;
    sync: (snapshot: SessionSnapshot) => Promise<boolean>;
    flush: (cleanShutdown?: boolean) => Promise<boolean>;
  };
  sidebar: {
    setOpen: (open: boolean) => Promise<void>;
  };
  chrome: {
    setBookmarkBar: (visible: boolean) => Promise<boolean>;
  };
  update: {
    version: () => Promise<string>;
    supported: () => Promise<boolean>;
    check: () => Promise<{ ok: boolean; error?: string }>;
    download: () => Promise<{ ok: boolean; error?: string }>;
    install: () => Promise<boolean>;
    onAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void) => () => void;
    onNotAvailable: (callback: () => void) => () => void;
    onProgress: (callback: (progress: { percent: number }) => void) => () => void;
    onReady: (callback: (info: { version: string }) => void) => () => void;
    onError: (callback: (err: { message: string }) => void) => () => void;
  };
  ai: {
    getStatus: () => Promise<EngineStatus>;
    chat: (tabId: string, messages: ChatMessage[], usePageContext: boolean, useWebSearch?: boolean) => Promise<{ ok: boolean; content?: string; error?: string }>;
    summarize: (tabId: string) => Promise<{ ok: boolean; content?: string; error?: string }>;
    explainSelection: (tabId: string) => Promise<{ ok: boolean; content?: string; error?: string }>;
    onStreamChunk: (callback: (chunk: string) => void) => () => void;
    onStreamDone: (callback: (content: string) => void) => () => void;
    onStreamError: (callback: (error: string) => void) => () => void;
    onWebSearchStart: (callback: () => void) => () => void;
    onWebSearchDone: (callback: (status: string, detail: string) => void) => () => void;
  };
  search: {
    semantic: (query: string, limit?: number) => Promise<SearchResult[]>;
    recent: (limit?: number) => Promise<unknown[]>;
  };
  storage: {
    bookmarkAdd: (url: string, title: string, contentId?: number) => Promise<unknown>;
    bookmarkRemove: (url: string) => Promise<boolean>;
    bookmarkList: () => Promise<unknown[]>;
    bookmarkCheck: (url: string) => Promise<boolean>;
    historyList: (opts?: { limit?: number; tier?: HistoryTier; query?: string }) => Promise<HistoryEntry[]>;
    historyClear: (tier?: HistoryTier) => Promise<boolean>;
    historyDelete: (historyId: number) => Promise<boolean>;
    historyMoveToVault: (historyId: number) => Promise<{ ok: boolean; error?: string }>;
  };
  vault: {
    isConfigured: () => Promise<boolean>;
    isUnlocked: () => Promise<boolean>;
    setup: (password: string) => Promise<{ ok: boolean; error?: string }>;
    unlock: (password: string) => Promise<{ ok: boolean; error?: string }>;
    lock: () => Promise<boolean>;
    changePassword: (oldPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
    list: (limit?: number) => Promise<VaultEntry[]>;
    deleteEntry: (id: number) => Promise<{ ok: boolean; error?: string }>;
    clearHistory: () => Promise<{ ok: boolean; error?: string }>;
  };
  bookmarks: {
    saveFromTab: (
      tabId: string,
      opts?: {
        userTags?: string[];
        workspaceId?: number;
        barParentId?: number | null;
        barInsertIndex?: number;
      }
    ) => Promise<{ ok: boolean; bookmark?: Bookmark; error?: string }>;
    remove: (url: string) => Promise<boolean>;
    list: (filter?: { tags?: string[]; workspaceId?: number; query?: string }) => Promise<Bookmark[]>;
    get: (id: number) => Promise<Bookmark | null>;
    check: (url: string) => Promise<boolean>;
    openArchive: (id: number) => Promise<string | null>;
    setTags: (id: number, tags: string[]) => Promise<boolean>;
    allTags: () => Promise<string[]>;
    favicon: (path: string) => Promise<string | null>;
    setIconMode: (id: number, mode: "favicon" | "letter") => Promise<boolean>;
    listBar: () => Promise<Bookmark[]>;
    setBar: (id: number, onBar: boolean) => Promise<boolean>;
    addUrlToBar: (url: string) => Promise<boolean>;
    listBarTree: () => Promise<BarNode[]>;
    barCreateFolder: (title: string, parentId?: number | null) => Promise<number>;
    barRenameFolder: (nodeId: number, title: string) => Promise<boolean>;
    barDeleteNode: (nodeId: number) => Promise<boolean>;
    barMoveNode: (nodeId: number, parentId: number | null, index: number) => Promise<boolean>;
    barAddBookmark: (bookmarkId: number, parentId?: number | null, insertIndex?: number) => Promise<number | null>;
    barAddUrl: (url: string, parentId?: number | null, insertIndex?: number) => Promise<number | null>;
  };
  aliases: {
    list: () => Promise<UrlAlias[]>;
    set: (alias: string, url: string, title?: string) => Promise<UrlAlias>;
    remove: (alias: string) => Promise<boolean>;
    resolve: (input: string) => Promise<UrlAlias | null>;
    map: () => Promise<Record<string, string>>;
  };
  workspaces: {
    list: () => Promise<Workspace[]>;
    create: (name: string) => Promise<Workspace>;
    rename: (id: number, name: string) => Promise<boolean>;
    delete: (id: number) => Promise<boolean>;
    defaultId: () => Promise<number>;
    getCanvas: (id: number) => Promise<WorkspaceCanvas>;
    setPin: (wsId: number, bookmarkId: number, x: number, y: number, w?: number, h?: number, z?: number) => Promise<boolean>;
    removePin: (wsId: number, bookmarkId: number) => Promise<boolean>;
    setViewport: (id: number, x: number, y: number, zoom: number) => Promise<boolean>;
  };
  settings: {
    get: () => Promise<Record<string, string>>;
    set: (key: string, value: string) => Promise<boolean>;
    getFormatted: () => Promise<InixSettings>;
    rebuildIndex: () => Promise<boolean>;
    pickDownloadFolder: () => Promise<string | null>;
    defaultDownloadPath: () => Promise<string>;
  };
  shortcuts: {
    onAction: (callback: (action: string) => void) => () => void;
  };
  credentials: {
    list: () => Promise<StoredCredential[]>;
    remove: (id: number) => Promise<boolean>;
  };
  autofill: {
    saveCredential: (payload: {
      origin: string;
      username: string;
      password: string;
      title: string;
    }) => Promise<{ ok: boolean; id?: number; error?: string }>;
    onSaveOffer: (
      callback: (offer: {
        origin: string;
        username: string;
        password: string;
        title: string;
        tabId?: string;
      }) => void
    ) => () => void;
    profiles: () => Promise<AutofillProfileMeta[]>;
    profileData: (id: number) => Promise<Record<string, string> | null>;
    createProfile: (label: string) => Promise<{ ok: boolean; profile?: AutofillProfileMeta; error?: string }>;
    updateProfile: (
      id: number,
      label: string,
      data: Record<string, string>
    ) => Promise<{ ok: boolean; error?: string }>;
    setDefault: (id: number) => Promise<boolean>;
    removeProfile: (id: number) => Promise<boolean>;
  };
  profiles: {
    list: () => Promise<BrowserProfile[]>;
    create: (name: string, color?: string) => Promise<BrowserProfile>;
    rename: (id: string, name: string) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    openWindow: (id: string) => Promise<boolean>;
  };
  import: {
    chromeProfiles: () => Promise<{
      userDataDir: string | null;
      profiles: Array<{ id: string; name: string; dir: string }>;
    }>;
    chromeBookmarks: (profileDir?: string) => Promise<ImportResult>;
    pickChromeBookmarks: () => Promise<ImportResult>;
    chromePasswords: (profileDir?: string) => Promise<ImportResult>;
    pickChromePasswordsCsv: () => Promise<ImportResult>;
  };
  relay: {
    getStatus: () => Promise<RelayState>;
    setEnabled: (enabled: boolean) => Promise<RelayState>;
    setMode: (mode: RelayMode, customUrl?: string) => Promise<RelayState>;
    test: () => Promise<RelayState>;
    setConnectOnStartup: (enabled: boolean) => Promise<boolean>;
    onStatus: (callback: (state: RelayState) => void) => () => void;
  };
}

export interface ImportResult {
  ok: boolean;
  canceled?: boolean;
  error?: string;
  imported?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  parsed?: number;
}

declare global {
  interface Window {
    inix: InixAPI;
  }
}

export type { HistoryEntry, HistoryTier, SessionSnapshot, VaultEntry };

export {};
