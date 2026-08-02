import { BrowserWindow, session, type Session } from "electron";
import { PRIVATE_PARTITION, getAllProfilePartitions } from "../profiles/manager";
import { getSetting, setSetting } from "../storage/settings";
import { tabManager } from "../tab-manager";
import {
  buildProxyRules,
  getInixTexasPreset,
  isRelayConfigured,
  isRelayEnabledInSettings,
  resolveRelayEndpoint,
  shouldConnectRelayOnStartup,
  type RelayEndpoint,
  type RelayMode,
} from "./relay-config";

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

const PROXY_BYPASS = "<local>,127.0.0.1,localhost,inix";

let cachedState: RelayState = {
  status: "off",
  enabled: false,
  mode: "off",
  region: "",
  label: "",
  exitIp: null,
  error: null,
  configured: false,
};

function browsingPartitions(): string[] {
  return [...getAllProfilePartitions(), PRIVATE_PARTITION];
}

function broadcastState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send("relay:status", cachedState);
  }
}

function setCachedState(patch: Partial<RelayState>): void {
  cachedState = { ...cachedState, ...patch };
  broadcastState();
}

function applyWebRtcPolicy(enabled: boolean): void {
  const policy = enabled ? "disable_non_proxied_udp" : "default";
  for (const wc of tabManager.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    try {
      wc.setWebRTCIPHandlingPolicy(policy);
    } catch {
      // ignore older webContents
    }
  }
}

async function applyProxyToSession(sess: Session, rules: string | null): Promise<void> {
  if (!rules) {
    await sess.setProxy({ mode: "direct" });
    return;
  }
  await sess.setProxy({
    mode: "fixed_servers",
    proxyRules: rules,
    proxyBypassRules: PROXY_BYPASS,
  });
}

async function applyProxyToAllPartitions(rules: string | null): Promise<void> {
  for (const partition of browsingPartitions()) {
    await applyProxyToSession(session.fromPartition(partition), rules);
  }
}

async function fetchExitIp(testSession: Session): Promise<string> {
  const response = await testSession.fetch("https://api.ipify.org?format=json");
  if (!response.ok) throw new Error(`IP check failed (${response.status})`);
  const body = (await response.json()) as { ip?: string };
  if (!body.ip) throw new Error("IP check returned no address");
  return body.ip;
}

function endpointFromState(endpoint: RelayEndpoint | null): Partial<RelayState> {
  if (!endpoint) {
    return {
      region: "",
      label: "",
    };
  }
  return {
    region: endpoint.region,
    label: endpoint.label,
    mode: endpoint.mode,
  };
}

export function getRelayState(): RelayState {
  return cachedState;
}

export async function setRelayEnabled(enabled: boolean): Promise<RelayState> {
  setSetting("relay_enabled", enabled ? "true" : "false");
  if (!enabled) {
    setSetting("relay_mode", "off");
  } else if (getSetting("relay_mode") === "off" || !getSetting("relay_mode")) {
    const preset = getInixTexasPreset();
    setSetting("relay_mode", preset ? "inix-tx" : "custom");
  }
  return applyRelayFromSettings();
}

export async function setRelayMode(mode: RelayMode, customUrl?: string): Promise<RelayState> {
  setSetting("relay_mode", mode);
  if (customUrl !== undefined) {
    setSetting("relay_custom_url", customUrl.trim());
  }
  if (mode !== "off") {
    setSetting("relay_enabled", "true");
  } else {
    setSetting("relay_enabled", "false");
  }
  return applyRelayFromSettings();
}

export async function applyRelayFromSettings(): Promise<RelayState> {
  const configured = isRelayConfigured();
  const enabled = isRelayEnabledInSettings();
  setCachedState({ configured, enabled });

  if (!enabled) {
    setCachedState({
      status: "off",
      mode: "off",
      exitIp: null,
      error: null,
      region: "",
      label: "",
    });
    await applyProxyToAllPartitions(null);
    applyWebRtcPolicy(false);
    return cachedState;
  }

  const endpoint = resolveRelayEndpoint();
  if (!endpoint) {
    setCachedState({
      status: "error",
      mode: getSetting("relay_mode") === "custom" ? "custom" : "inix-tx",
      error: configured
        ? "Relay endpoint misconfigured. Check host, port, and credentials."
        : "No relay server configured. Set INIX_RELAY_* env vars or a custom proxy URL in Settings.",
      exitIp: null,
      ...endpointFromState(null),
    });
    await applyProxyToAllPartitions(null);
    applyWebRtcPolicy(false);
    return cachedState;
  }

  setCachedState({
    status: "connecting",
    ...endpointFromState(endpoint),
    error: null,
    exitIp: null,
  });

  const rules = buildProxyRules(endpoint);
  try {
    await applyProxyToAllPartitions(rules);
    applyWebRtcPolicy(true);
    const testSession = session.fromPartition(browsingPartitions()[0] ?? PRIVATE_PARTITION);
    const exitIp = await fetchExitIp(testSession);
    setCachedState({
      status: "connected",
      exitIp,
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setCachedState({
      status: "error",
      error: message,
      exitIp: null,
    });
    await applyProxyToAllPartitions(null);
    applyWebRtcPolicy(false);
  }

  return cachedState;
}

export async function testRelayConnection(): Promise<RelayState> {
  return applyRelayFromSettings();
}

export async function initRelayOnStartup(): Promise<void> {
  cachedState.configured = isRelayConfigured();
  if (shouldConnectRelayOnStartup() && isRelayEnabledInSettings()) {
    await applyRelayFromSettings();
    return;
  }
  if (!isRelayEnabledInSettings()) {
    setCachedState({
      status: "off",
      enabled: false,
      mode: "off",
      exitIp: null,
      error: null,
    });
  }
  broadcastState();
}

/** Re-apply WebRTC policy when a new tab webContents is created while relay is on. */
export function onTabWebContentsCreated(wc: Electron.WebContents): void {
  if (cachedState.status !== "connected") return;
  try {
    wc.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  } catch {
    // ignore
  }
}
