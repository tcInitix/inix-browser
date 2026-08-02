#!/usr/bin/env node
/**
 * Build Inix with electron-builder into a fresh temp directory, then copy
 * release artifacts into release-build/. Avoids ERR_ELECTRON_BUILDER_CANNOT_EXECUTE
 * when release-build/win-unpacked/resources/app.asar is locked (Cursor, Inix, AV).
 */

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = path.join(ROOT, "release-build");

function parseArgs(argv) {
  return { publish: argv.includes("--publish") };
}

/** Kill app processes that commonly lock win-unpacked on Windows. */
export function closeLockingProcesses() {
  if (process.platform !== "win32") return;

  for (const image of ["Inix.exe", "electron.exe"]) {
    try {
      execFileSync("taskkill", ["/IM", image, "/F", "/T"], { stdio: "pipe" });
      console.log(`Closed ${image} before build.`);
    } catch {
      // not running
    }
  }

  try {
    execSync("ping -n 2 127.0.0.1 > nul", { stdio: "ignore", shell: true });
  } catch {
    // ignore
  }
}

/** Fresh output dir — never reuses a locked win-unpacked tree. */
export function createStagingOutputDir() {
  const staging = path.join(os.tmpdir(), `inix-build-${process.pid}-${Date.now()}`);
  fs.mkdirSync(staging, { recursive: true });
  return staging;
}

/** Copy installer + metadata to release-build/ for local use. Skip win-unpacked. */
export function copyArtifactsToReleaseBuild(staging) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const copied = [];
  for (const name of fs.readdirSync(staging)) {
    if (name === "win-unpacked") continue;
    const src = path.join(staging, name);
    let stat;
    try {
      stat = fs.statSync(src);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    fs.copyFileSync(src, path.join(ARTIFACT_DIR, name));
    copied.push(name);
  }

  if (copied.length) {
    console.log(`Copied to ${path.relative(ROOT, ARTIFACT_DIR)}: ${copied.join(", ")}`);
  }
}

export function runElectronBuilder(staging, { publish = false } = {}) {
  const outputArg = JSON.stringify(staging);
  const publishFlag = publish ? " --publish always" : "";
  execSync(`npx electron-builder --config.directories.output=${outputArg}${publishFlag}`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  closeLockingProcesses();
  const staging = createStagingOutputDir();
  console.log(`Building into ${staging}`);
  try {
    runElectronBuilder(staging, opts);
    copyArtifactsToReleaseBuild(staging);
  } finally {
    try {
      fs.rmSync(staging, { recursive: true, force: true });
    } catch {
      console.warn(`Could not remove staging dir (safe to delete): ${staging}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
