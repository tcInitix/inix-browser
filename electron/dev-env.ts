import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Dev-only: separate profile + cache dirs so hot-reload restarts don't fight the production app or each other. */
export function configureDevEnvironment(): void {
  if (app.isPackaged) return;

  const devUserData = path.join(app.getPath("appData"), "Inix-dev");
  app.setPath("userData", devUserData);

  const cacheRoot = path.join(os.tmpdir(), "inix-browser-dev-cache", String(process.pid));
  fs.mkdirSync(cacheRoot, { recursive: true });

  app.commandLine.appendSwitch("disk-cache-dir", path.join(cacheRoot, "disk"));
  app.commandLine.appendSwitch("gpu-disk-cache-dir", path.join(cacheRoot, "gpu"));
  app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
}
