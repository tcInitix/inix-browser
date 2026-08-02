import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type AuthBrowser = "chrome" | "edge";

export interface OpenAuthBrowserResult {
  browser: AuthBrowser;
  label: string;
  executable: string;
}

function firstExisting(paths: string[]): string | null {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
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
    return { browser: "chrome", label: "Chrome", executable: chrome };
  }
  const edge = findEdgeExecutable();
  if (edge) {
    return { browser: "edge", label: "Microsoft Edge", executable: edge };
  }
  throw new Error("Google sign-in requires Chrome or Microsoft Edge.");
}

export function openAuthInBrowser(url: string): OpenAuthBrowserResult {
  const resolved = resolveAuthBrowser();
  spawn(resolved.executable, [url], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref();
  return resolved;
}
