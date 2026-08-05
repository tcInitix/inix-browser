import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export type AuthBrowser = "chrome" | "edge";

export interface OpenAuthBrowserResult {
  browser: AuthBrowser;
  label: string;
  executable: string;
  userDataDir: string;
}

function firstExisting(paths: string[]): string | null {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Isolated browser profile used only for Inix Google sign-in (not the user's daily browser). */
export function getAuthBrowserUserDataDir(browser: AuthBrowser): string {
  const folder = browser === "chrome" ? "google-auth-chrome" : "google-auth-edge";
  return path.join(app.getPath("userData"), folder);
}

export function findChromeExecutable(): string | null {
  if (process.platform !== "win32") return null;
  return firstExisting([
    path.join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ]);
}

export function findEdgeExecutable(): string | null {
  if (process.platform !== "win32") return null;
  return firstExisting([
    path.join(process.env.PROGRAMFILES ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ]);
}

export function resolveAuthBrowser(): OpenAuthBrowserResult {
  const chrome = findChromeExecutable();
  if (chrome) {
    return {
      browser: "chrome",
      label: "Chrome",
      executable: chrome,
      userDataDir: getAuthBrowserUserDataDir("chrome"),
    };
  }
  const edge = findEdgeExecutable();
  if (edge) {
    return {
      browser: "edge",
      label: "Microsoft Edge",
      executable: edge,
      userDataDir: getAuthBrowserUserDataDir("edge"),
    };
  }
  throw new Error("Google sign-in requires Chrome or Microsoft Edge.");
}

export function openAuthInBrowser(url: string): OpenAuthBrowserResult {
  const resolved = resolveAuthBrowser();
  fs.mkdirSync(resolved.userDataDir, { recursive: true });
  spawn(
    resolved.executable,
    [
      `--user-data-dir=${resolved.userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      url,
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    }
  ).unref();
  return resolved;
}
