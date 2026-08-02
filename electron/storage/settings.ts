import { runQuery, runExec, saveDatabase } from "./db";

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

export function getSetting(key: string): string {
  const rows = runQuery<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
  return rows[0]?.value ?? "";
}

export function setSetting(key: string, value: string): void {
  runExec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  saveDatabase();
}

export function getAllSettings(): Record<string, string> {
  const rows = runQuery<{ key: string; value: string }>("SELECT key, value FROM settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export interface Settings {
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
  history_mode: "standard" | "transient" | "vaulted";
  transient_purge_on_close: boolean;
  transient_retention_hours: number;
  homepage_url: string;
  new_tab_use_homepage: boolean;
  restore_tabs_on_launch: boolean;
  private_mode_shortcut: "window" | "tab";
  bookmark_bar_enabled: boolean;
  panic_configured: boolean;
  panic_urls: string[];
  new_tab_quick_links: QuickLinkSetting[];
  // General
  startup_mode: StartupMode;
  startup_urls: string[];
  default_search_engine: SearchEngineId;
  custom_search_url: string;
  // Appearance
  theme_mode: ThemeMode;
  default_zoom_level: number;
  ui_font_scale: UiFontScale;
  // Privacy & security
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
  // Downloads
  download_path: string;
  prompt_for_download: boolean;
  // Browsing
  close_window_with_last_tab: boolean;
  open_links_in_new_tab: boolean;
  // New tab page
  new_tab_show_search: boolean;
  new_tab_show_quick_links: boolean;
}

export interface QuickLinkSetting {
  label: string;
  url: string;
  icon?: "letter";
}

function parseBool(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value === "true";
}

function parseBoolDefaultTrue(value: string | undefined): boolean {
  return value !== "false";
}

function parseIntSetting(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonStringArray(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function parseQuickLinksSetting(raw: string): QuickLinkSetting[] {
  const fallback = [
    { label: "DuckDuckGo", url: "https://duckduckgo.com" },
    { label: "GitHub", url: "https://github.com" },
    { label: "Reddit", url: "https://reddit.com" },
    { label: "Hacker News", url: "https://news.ycombinator.com" },
  ];
  if (!raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const links = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const label = typeof row.label === "string" ? row.label.trim() : "";
        const url = typeof row.url === "string" ? row.url.trim() : "";
        if (!label || !url) return null;
        const link: QuickLinkSetting = { label, url };
        if (row.icon === "letter") link.icon = "letter";
        return link;
      })
      .filter((item): item is QuickLinkSetting => item != null);
    return links.length ? links : fallback;
  } catch {
    return fallback;
  }
}

function parseSearchEngine(raw: string | undefined): SearchEngineId {
  const valid: SearchEngineId[] = [
    "duckduckgo",
    "google",
    "bing",
    "brave",
    "ecosia",
    "startpage",
    "custom",
  ];
  return valid.includes(raw as SearchEngineId) ? (raw as SearchEngineId) : "duckduckgo";
}

function parseStartupMode(raw: string | undefined, restoreTabs: boolean): StartupMode {
  const valid: StartupMode[] = ["restore", "new_tab", "homepage", "urls"];
  if (valid.includes(raw as StartupMode)) return raw as StartupMode;
  return restoreTabs ? "restore" : "new_tab";
}

function parseThemeMode(raw: string | undefined): ThemeMode {
  return raw === "light" || raw === "system" ? raw : "dark";
}

function parseFontScale(raw: string | undefined): UiFontScale {
  return raw === "small" || raw === "large" ? raw : "medium";
}

function parsePermissionDefault(raw: string | undefined): PermissionDefault {
  return raw === "allow" || raw === "block" ? raw : "ask";
}

export function getSettings(): Settings {
  const engineHost =
    getSetting("engine_host") || getSetting("ollama_host") || "http://127.0.0.1:11434";
  const restoreTabs = parseBoolDefaultTrue(getSetting("restore_tabs_on_launch"));
  const historyMode = getSetting("history_mode") || "standard";
  const provider = getSetting("ai_provider") === "api" ? "api" : "local";

  return {
    ai_provider: provider,
    engine_host: engineHost,
    chat_model: getSetting("chat_model") || "qwen2.5:7b",
    embed_model: getSetting("embed_model") || "nomic-embed-text",
    api_base_url: getSetting("api_base_url") || "https://api.openai.com/v1",
    api_key: getSetting("api_key") || "",
    api_model: getSetting("api_model") || "gpt-4o-mini",
    capture_enabled: parseBoolDefaultTrue(getSetting("capture_enabled")),
    archive_enabled: parseBoolDefaultTrue(getSetting("archive_enabled")),
    tab_freeze_enabled: parseBoolDefaultTrue(getSetting("tab_freeze_enabled")),
    tab_freeze_minutes: parseIntSetting(getSetting("tab_freeze_minutes"), 30),
    history_mode:
      historyMode === "transient" || historyMode === "vaulted" ? historyMode : "standard",
    transient_purge_on_close: parseBoolDefaultTrue(getSetting("transient_purge_on_close")),
    transient_retention_hours: parseIntSetting(getSetting("transient_retention_hours"), 24),
    homepage_url: getSetting("homepage_url") || "inix://newtab",
    new_tab_use_homepage: parseBool(getSetting("new_tab_use_homepage")),
    restore_tabs_on_launch: restoreTabs,
    private_mode_shortcut: getSetting("private_mode_shortcut") === "tab" ? "tab" : "window",
    bookmark_bar_enabled: parseBool(getSetting("bookmark_bar_enabled")),
    panic_configured: parseBool(getSetting("panic_configured")),
    panic_urls: parseJsonStringArray(getSetting("panic_urls")),
    new_tab_quick_links: parseQuickLinksSetting(getSetting("new_tab_quick_links")),
    startup_mode: parseStartupMode(getSetting("startup_mode"), restoreTabs),
    startup_urls: parseJsonStringArray(getSetting("startup_urls")),
    default_search_engine: parseSearchEngine(getSetting("default_search_engine")),
    custom_search_url: getSetting("custom_search_url") || "",
    theme_mode: parseThemeMode(getSetting("theme_mode")),
    default_zoom_level: parseIntSetting(getSetting("default_zoom_level"), 0),
    ui_font_scale: parseFontScale(getSetting("ui_font_scale")),
    tracker_blocking_enabled: parseBoolDefaultTrue(getSetting("tracker_blocking_enabled")),
    https_only_mode: parseBool(getSetting("https_only_mode")),
    block_third_party_cookies: parseBool(getSetting("block_third_party_cookies")),
    clear_cookies_on_exit: parseBool(getSetting("clear_cookies_on_exit")),
    clear_cache_on_exit: parseBool(getSetting("clear_cache_on_exit")),
    offer_save_passwords: parseBoolDefaultTrue(getSetting("offer_save_passwords")),
    autofill_enabled: parseBoolDefaultTrue(getSetting("autofill_enabled")),
    default_notifications: parsePermissionDefault(getSetting("default_notifications")),
    default_geolocation: parsePermissionDefault(getSetting("default_geolocation")),
    default_media: parsePermissionDefault(getSetting("default_media")),
    download_path: getSetting("download_path") || "",
    prompt_for_download: parseBool(getSetting("prompt_for_download")),
    close_window_with_last_tab: parseBool(getSetting("close_window_with_last_tab")),
    open_links_in_new_tab: parseBool(getSetting("open_links_in_new_tab")),
    new_tab_show_search: parseBoolDefaultTrue(getSetting("new_tab_show_search")),
    new_tab_show_quick_links: parseBoolDefaultTrue(getSetting("new_tab_show_quick_links")),
  };
}

/** Sync legacy restore_tabs_on_launch when startup_mode changes. */
export function syncStartupSettings(mode: StartupMode): void {
  setSetting("startup_mode", mode);
  setSetting("restore_tabs_on_launch", mode === "restore" ? "true" : "false");
}

export function getFormattedSettings(): Settings {
  return getSettings();
}
