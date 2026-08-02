import { ipcMain } from "electron";
import { setSetting } from "../storage/settings";
import type { RelayMode } from "./relay-config";
import {
  getRelayState,
  setRelayEnabled,
  setRelayMode,
  testRelayConnection,
} from "./manager";

export function registerRelayHandlers(): void {
  ipcMain.handle("relay:get-status", () => getRelayState());

  ipcMain.handle("relay:set-enabled", async (_e, enabled: boolean) => setRelayEnabled(enabled));

  ipcMain.handle("relay:set-mode", async (_e, mode: RelayMode, customUrl?: string) =>
    setRelayMode(mode, customUrl)
  );

  ipcMain.handle("relay:test", async () => testRelayConnection());

  ipcMain.handle("relay:set-connect-on-startup", (_e, enabled: boolean) => {
    setSetting("relay_connect_on_startup", enabled ? "true" : "false");
    return true;
  });
}
