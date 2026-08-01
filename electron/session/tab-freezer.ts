import { getSetting } from "../storage/settings";
import { tabManager } from "../tab-manager";
import { sessionManager } from "./session-manager";

const CHECK_INTERVAL_MS = 60_000;
const FREEZE_SCRIPT = `(function(){ return { scrollY: window.scrollY || 0, title: document.title || '', url: location.href || '' }; })()`;

let interval: ReturnType<typeof setInterval> | null = null;

export function startTabFreezer(): void {
  if (interval) return;
  interval = setInterval(() => void checkAndFreeze(), CHECK_INTERVAL_MS);
}

export function stopTabFreezer(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

function isFreezeEnabled(): boolean {
  return getSetting("tab_freeze_enabled") !== "false";
}

function freezeMinutes(): number {
  const raw = parseInt(getSetting("tab_freeze_minutes") || "30", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

async function checkAndFreeze(): Promise<void> {
  if (!isFreezeEnabled()) return;

  const threshold = Date.now() - freezeMinutes() * 60_000;
  const activeId = tabManager.getActiveTabId();
  const candidates = tabManager.getBackgroundTabIds();

  for (const tabId of candidates) {
    if (tabId === activeId) continue;
    if (tabManager.isFrozen(tabId)) continue;
    if (tabManager.isPrivate(tabId)) continue;

    const url = tabManager.getTabUrl(tabId);
    if (url.startsWith("inix://") || url.startsWith("about:")) continue;

    const lastActive = tabManager.getLastActiveAt(tabId);
    if (lastActive > threshold) continue;

    await tabManager.freezeTab(tabId);
  }
}

export async function captureTabState(tabId: string): Promise<{ scrollY: number; title: string; url: string } | null> {
  const wc = tabManager.getWebContents(tabId);
  if (!wc || wc.isDestroyed()) return null;
  try {
    return (await wc.executeJavaScript(FREEZE_SCRIPT)) as { scrollY: number; title: string; url: string };
  } catch {
    return { scrollY: 0, title: wc.getTitle(), url: wc.getURL() };
  }
}

export function onTabFrozen(tabId: string, scrollY: number, url: string, title: string): void {
  sessionManager.updateNode(tabId, { frozen: true, scrollY, url, title, lastActiveAt: Date.now() });
}

export function onTabUnfrozen(tabId: string): void {
  sessionManager.updateNode(tabId, { frozen: false, lastActiveAt: Date.now() });
}
