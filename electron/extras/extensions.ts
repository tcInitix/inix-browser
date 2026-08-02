/**
 * Chrome extension MV2 unpacked loader scaffold.
 *
 * Electron's `session.loadExtension()` supports a subset of the
 * Chrome MV2 extension API. This module walks a user-chosen folder,
 * validates a `manifest.json` at its root, and loads it into the
 * default browsing session.
 *
 * Limitations (be honest about these):
 *  - Only MV2 manifests are broadly supported by Electron 34
 *  - No chrome://extensions management UI
 *  - No auto-update, no CRX packaging, no Chrome Web Store install
 *  - Content-script + background scripts work; devtools_page and
 *    UI surfaces (browser_action popups) are limited
 *
 * Wire IPC handlers separately if we want a full flow.
 */
import { session, app } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface LoadedExtension {
  id: string;
  name: string;
  version: string;
  path: string;
}

const loaded = new Map<string, LoadedExtension>();

function extensionsFile(): string {
  return path.join(app.getPath("userData"), "extensions.json");
}

function persist(): void {
  const list = [...loaded.values()];
  try {
    fs.writeFileSync(extensionsFile(), JSON.stringify(list, null, 2), "utf8");
  } catch {
    // ignore
  }
}

function readPersisted(): LoadedExtension[] {
  try {
    const raw = fs.readFileSync(extensionsFile(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoadedExtension[]) : [];
  } catch {
    return [];
  }
}

export async function loadUnpackedExtension(
  extensionPath: string,
): Promise<{ ok: boolean; extension?: LoadedExtension; error?: string }> {
  try {
    const manifestPath = path.join(extensionPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      return { ok: false, error: "manifest.json not found in the selected folder" };
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      manifest_version?: number;
      name?: string;
      version?: string;
    };
    if (manifest.manifest_version && manifest.manifest_version >= 3) {
      return {
        ok: false,
        error: "Manifest V3 extensions are only partially supported by Electron. Try an MV2 build.",
      };
    }
    const ext = await session.defaultSession.loadExtension(extensionPath, { allowFileAccess: false });
    const record: LoadedExtension = {
      id: ext.id,
      name: manifest.name ?? ext.name ?? "Unnamed extension",
      version: manifest.version ?? ext.version ?? "0.0.0",
      path: extensionPath,
    };
    loaded.set(ext.id, record);
    persist();
    return { ok: true, extension: record };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function listLoadedExtensions(): LoadedExtension[] {
  return [...loaded.values()];
}

export function unloadExtension(id: string): boolean {
  try {
    session.defaultSession.removeExtension(id);
    loaded.delete(id);
    persist();
    return true;
  } catch {
    return false;
  }
}

/** Reload persisted extensions on startup. Failures are silently skipped. */
export async function reloadPersistedExtensions(): Promise<void> {
  const persisted = readPersisted();
  for (const rec of persisted) {
    if (!fs.existsSync(rec.path)) continue;
    try {
      const ext = await session.defaultSession.loadExtension(rec.path, { allowFileAccess: false });
      loaded.set(ext.id, { ...rec, id: ext.id });
    } catch {
      // skip
    }
  }
}
