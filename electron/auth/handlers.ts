import { ipcMain, session } from "electron";
import { importGoogleCookiesIntoSession } from "./chromium-cookies";
import {
  clearPendingGoogleAuth,
  getPendingGoogleAuth,
  reopenGoogleAuth,
} from "./google-auth";
import {
  getProfilePartition,
  getWindowProfileId,
  PRIVATE_PARTITION,
} from "../profiles/manager";
import { tabManager } from "../tab-manager";

function getSessionForTab(tabId: string) {
  const win = tabManager.getWindowForTab(tabId);
  if (!win) return null;
  const partition = tabManager.isPrivate(tabId)
    ? PRIVATE_PARTITION
    : getProfilePartition(getWindowProfileId(win));
  return session.fromPartition(partition);
}

export function registerGoogleAuthHandlers(): void {
  ipcMain.handle("google-auth:complete", async (_e, tabId: string) => {
    const pending = getPendingGoogleAuth(tabId);
    if (!pending) {
      return { ok: false, imported: 0, skipped: 0, error: "No pending Google sign-in for this tab." };
    }

    const sess = getSessionForTab(tabId);
    if (!sess) {
      return { ok: false, imported: 0, skipped: 0, error: "Could not access this tab's session." };
    }

    const result = await importGoogleCookiesIntoSession(sess, pending.browser);
    if (!result.ok) {
      return result;
    }

    const wc = tabManager.getWebContents(tabId);
    if (wc && !wc.isDestroyed()) {
      try {
        await wc.loadURL(pending.returnUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ...result, ok: false, error: `Cookies imported but reload failed: ${msg}` };
      }
    }

    clearPendingGoogleAuth(tabId);
    return result;
  });

  ipcMain.handle("google-auth:cancel", (_e, tabId: string) => {
    clearPendingGoogleAuth(tabId);
    return true;
  });

  ipcMain.handle("google-auth:reopen", (_e, tabId: string) => reopenGoogleAuth(tabId));
}
