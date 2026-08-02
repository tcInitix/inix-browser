import { shell, type BrowserWindow } from "electron";
import { openAuthInBrowser, type AuthBrowser } from "./browser-launcher";

export interface GoogleAuthStartedEvent {
  tabId: string;
  browser: AuthBrowser;
  browserLabel: string;
}

export interface PendingGoogleAuth {
  tabId: string;
  authUrl: string;
  returnUrl: string;
  browser: AuthBrowser;
  browserLabel: string;
}

export interface GoogleAuthImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
  error?: string;
}

const pendingByTab = new Map<string, PendingGoogleAuth>();

const GOOGLE_AUTH_HOSTS = new Set([
  "accounts.google.com",
  "accounts.youtube.com",
  "myaccount.google.com",
]);

export function isGoogleAuthUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (GOOGLE_AUTH_HOSTS.has(host)) return true;
    if (host === "www.google.com" || host === "google.com") {
      const pathLower = parsed.pathname.toLowerCase();
      if (
        pathLower.includes("signin") ||
        pathLower.includes("servicelogin") ||
        pathLower.includes("oauth")
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function inferReturnUrl(authUrl: string, currentTabUrl: string): string {
  try {
    const parsed = new URL(authUrl);
    const continueParam = parsed.searchParams.get("continue") ?? parsed.searchParams.get("redirect_uri");
    if (continueParam) {
      const decoded = decodeURIComponent(continueParam);
      if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
        return decoded;
      }
    }
  } catch {
    // ignore malformed auth URL
  }

  try {
    const host = new URL(currentTabUrl).hostname.toLowerCase();
    if (host.includes("youtube") || host.includes("google")) {
      return currentTabUrl;
    }
  } catch {
    // ignore malformed tab URL
  }

  return "https://www.youtube.com";
}

export function getPendingGoogleAuth(tabId: string): PendingGoogleAuth | null {
  return pendingByTab.get(tabId) ?? null;
}

export function clearPendingGoogleAuth(tabId: string): void {
  pendingByTab.delete(tabId);
}

export function startGoogleAuth(
  tabId: string,
  authUrl: string,
  win: BrowserWindow,
  currentTabUrl: string
): boolean {
  if (!isGoogleAuthUrl(authUrl)) return false;

  if (process.platform !== "win32") {
    void shell.openExternal(authUrl);
    return true;
  }

  try {
    const opened = openAuthInBrowser(authUrl);
    pendingByTab.set(tabId, {
      tabId,
      authUrl,
      returnUrl: inferReturnUrl(authUrl, currentTabUrl),
      browser: opened.browser,
      browserLabel: opened.label,
    });
    const payload: GoogleAuthStartedEvent = {
      tabId,
      browser: opened.browser,
      browserLabel: opened.label,
    };
    win.webContents.send("google-auth:started", payload);
    return true;
  } catch {
    void shell.openExternal(authUrl);
    return true;
  }
}

export function reopenGoogleAuth(tabId: string): boolean {
  const pending = pendingByTab.get(tabId);
  if (!pending) return false;
  openAuthInBrowser(pending.authUrl);
  return true;
}
