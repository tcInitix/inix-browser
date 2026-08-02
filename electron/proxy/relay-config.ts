import { getSetting } from "../storage/settings";

export type RelayMode = "off" | "inix-tx" | "custom";

export interface RelayEndpoint {
  mode: RelayMode;
  label: string;
  region: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

/** Bundled Inix US-TX preset — set via env or relay-config.local.json at build/dev time. */
export function getInixTexasPreset(): RelayEndpoint | null {
  const host = (process.env.INIX_RELAY_HOST ?? "").trim();
  const port = parseInt(process.env.INIX_RELAY_PORT ?? "", 10);
  const username = (process.env.INIX_RELAY_USER ?? process.env.INIX_RELAY_USERNAME ?? "").trim();
  const password = (process.env.INIX_RELAY_PASS ?? process.env.INIX_RELAY_PASSWORD ?? "").trim();

  if (!host || !Number.isFinite(port) || port <= 0) return null;

  return {
    mode: "inix-tx",
    label: "Inix US Relay",
    region: "United States (Texas)",
    host,
    port,
    username,
    password,
  };
}

function parseCustomProxyUrl(raw: string): RelayEndpoint | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`socks5://${trimmed}`);
    const host = url.hostname;
    const port = parseInt(url.port || "1080", 10);
    if (!host || !Number.isFinite(port) || port <= 0) return null;

    return {
      mode: "custom",
      label: "Custom proxy",
      region: "Custom",
      host,
      port,
      username: decodeURIComponent(url.username || ""),
      password: decodeURIComponent(url.password || ""),
    };
  } catch {
    return null;
  }
}

export function getRelayModeFromSettings(): RelayMode {
  const raw = getSetting("relay_mode");
  if (raw === "inix-tx" || raw === "custom") return raw;
  return "off";
}

export function isRelayEnabledInSettings(): boolean {
  return getSetting("relay_enabled") === "true";
}

export function shouldConnectRelayOnStartup(): boolean {
  return getSetting("relay_connect_on_startup") === "true";
}

/** Resolve active relay endpoint from settings + env preset. */
export function resolveRelayEndpoint(): RelayEndpoint | null {
  if (!isRelayEnabledInSettings()) return null;

  const mode = getRelayModeFromSettings();
  if (mode === "inix-tx") {
    return getInixTexasPreset();
  }
  if (mode === "custom") {
    return parseCustomProxyUrl(getSetting("relay_custom_url"));
  }
  return null;
}

export function buildProxyRules(endpoint: RelayEndpoint): string {
  const auth =
    endpoint.username || endpoint.password
      ? `${encodeURIComponent(endpoint.username)}:${encodeURIComponent(endpoint.password)}@`
      : "";
  return `socks5://${auth}${endpoint.host}:${endpoint.port}`;
}

export function isRelayConfigured(): boolean {
  return getInixTexasPreset() != null || getSetting("relay_custom_url").trim().length > 0;
}
