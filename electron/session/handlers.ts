import { ipcMain } from "electron";
import { sessionManager } from "./session-manager";
import type { SessionSnapshot } from "./session-types";

export function registerSessionHandlers(): void {
  ipcMain.handle("session:get-restore", () => sessionManager.getRestore());
  ipcMain.handle("session:was-crash-restore", () => sessionManager.wasCrashRestore());
  ipcMain.handle("session:sync", (_e, snapshot: SessionSnapshot) => {
    sessionManager.sync(snapshot);
    return true;
  });
  ipcMain.handle("session:flush", (_e, cleanShutdown?: boolean) => {
    sessionManager.flush(cleanShutdown ?? false);
    return true;
  });
}
