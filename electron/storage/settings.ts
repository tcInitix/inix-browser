import { runQuery, runExec, saveDatabase } from "./db";

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
  private_mode_shortcut: "window" | "tab";
  bookmark_bar_enabled: boolean;
  panic_configured: boolean;
  panic_urls: string[];
  new_tab_quick_links: QuickLinkSetting[];
}

export interface QuickLinkSetting {
  label: string;
  url: string;
  icon?: "letter";
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

export function getSettings(): Settings {
  const engineHost =
    getSetting("engine_host") || getSetting("ollama_host") || "http://127.0.0.1:11434";
  const freezeMinutes = parseInt(getSetting("tab_freeze_minutes") || "30", 10);
  const retentionHours = parseInt(getSetting("transient_retention_hours") || "24", 10);
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
    capture_enabled: getSetting("capture_enabled") !== "false",
    archive_enabled: getSetting("archive_enabled") !== "false",
    tab_freeze_enabled: getSetting("tab_freeze_enabled") !== "false",
    tab_freeze_minutes: Number.isFinite(freezeMinutes) ? freezeMinutes : 30,
    history_mode:
      historyMode === "transient" || historyMode === "vaulted" ? historyMode : "standard",
    transient_purge_on_close: getSetting("transient_purge_on_close") !== "false",
    transient_retention_hours: Number.isFinite(retentionHours) ? retentionHours : 24,
    homepage_url: getSetting("homepage_url") || "inix://newtab",
    new_tab_use_homepage: getSetting("new_tab_use_homepage") === "true",
    private_mode_shortcut: getSetting("private_mode_shortcut") === "tab" ? "tab" : "window",
    bookmark_bar_enabled: getSetting("bookmark_bar_enabled") === "true",
    panic_configured: getSetting("panic_configured") === "true",
    panic_urls: (() => {
      try {
        const parsed = JSON.parse(getSetting("panic_urls") || "[]") as unknown;
        return Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === "string")
          : [];
      } catch {
        return [];
      }
    })(),
    new_tab_quick_links: parseQuickLinksSetting(getSetting("new_tab_quick_links")),
  };
}
