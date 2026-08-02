import { ipcMain, BrowserWindow } from "electron";
import { tabManager } from "../tab-manager";
import {
  credentialsForOrigin,
  getCredentialPassword,
  saveCredential,
  credentialExists,
  listCredentials,
  removeCredential,
} from "../storage/credentials";
import {
  listAutofillProfiles,
  getAutofillProfileData,
  createAutofillProfile,
  updateAutofillProfile,
  setDefaultAutofillProfile,
  removeAutofillProfile,
  type AutofillProfileData,
} from "../storage/autofill-profiles";
import {
  listProfiles,
  createProfile,
  renameProfile,
  deleteProfile,
  getProfile,
} from "../profiles/manager";
import { getSettings } from "../storage/settings";
import { isVaultConfigured, isVaultUnlocked } from "../storage/vault";

export function registerAutofillHandlers(
  createProfileWindow: (profileId: string) => BrowserWindow
): void {
  ipcMain.on(
    "autofill:offer-save",
    (
      e,
      payload: { origin: string; username: string; password: string; title: string }
    ) => {
      if (!payload.origin || !payload.username || !payload.password) return;
      if (!getSettings().offer_save_passwords) return;
      if (!isVaultConfigured() || !isVaultUnlocked()) return;
      if (credentialExists(payload.origin, payload.username)) return;

      const tabId = tabManager.getTabIdForWebContents(e.sender.id);
      const win =
        (tabId ? tabManager.getWindowForTab(tabId) : null) ??
        BrowserWindow.fromWebContents(e.sender);
      if (!win || win.isDestroyed()) return;

      win.webContents.send("autofill:save-offer", {
        origin: payload.origin,
        username: payload.username,
        password: payload.password,
        title: payload.title,
        tabId,
      });
    }
  );

  ipcMain.handle("autofill:save-credential", (_e, payload: {
    origin: string;
    username: string;
    password: string;
    title: string;
  }) => {
    try {
      const id = saveCredential(
        payload.origin,
        payload.username,
        payload.password,
        payload.title
      );
      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to save" };
    }
  });

  ipcMain.handle("credentials:for-origin", (_e, origin: string) =>
    credentialsForOrigin(origin)
  );
  ipcMain.handle("credentials:get-password", (_e, id: number) => getCredentialPassword(id));
  ipcMain.handle("credentials:list", () => listCredentials());
  ipcMain.handle("credentials:remove", (_e, id: number) => {
    removeCredential(id);
    return true;
  });

  ipcMain.handle("autofill:profiles", () => listAutofillProfiles());
  ipcMain.handle("autofill:profile-data", (_e, id: number) => getAutofillProfileData(id));
  ipcMain.handle("autofill:create-profile", (_e, label: string) => {
    try {
      return { ok: true, profile: createAutofillProfile(label) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed" };
    }
  });
  ipcMain.handle(
    "autofill:update-profile",
    (_e, id: number, label: string, data: AutofillProfileData) => {
      try {
        updateAutofillProfile(id, label, data);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Failed" };
      }
    }
  );
  ipcMain.handle("autofill:set-default", (_e, id: number) => {
    setDefaultAutofillProfile(id);
    return true;
  });
  ipcMain.handle("autofill:remove-profile", (_e, id: number) => {
    removeAutofillProfile(id);
    return true;
  });

  ipcMain.handle("profiles:list", () => listProfiles());
  ipcMain.handle("profiles:get", (_e, id: string) => getProfile(id));
  ipcMain.handle("profiles:create", (_e, name: string, color?: string) =>
    createProfile(name, color)
  );
  ipcMain.handle("profiles:rename", (_e, id: string, name: string) =>
    renameProfile(id, name)
  );
  ipcMain.handle("profiles:delete", (_e, id: string) => deleteProfile(id));
  ipcMain.handle("profiles:open-window", (_e, profileId: string) => {
    createProfileWindow(profileId);
    return true;
  });
}
