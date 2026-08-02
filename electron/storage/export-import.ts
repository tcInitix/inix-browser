import crypto from "node:crypto";
import fs from "node:fs";
import { dialog, BrowserWindow } from "electron";
import { getDb, saveDatabase } from "./db";
import { getAllSettings, setSetting } from "./settings";
import { listBookmarks } from "./bookmarks";
import { listAliases, setAlias } from "./aliases";
import { getBarTree, importBarTree, type ImportBarNode } from "./bookmark-bar";

/**
 * Encrypted portable backup of user data (bookmarks, bookmark bar tree,
 * aliases, and app settings). Uses AES-256-GCM with PBKDF2-derived key
 * from a user-supplied passphrase. Vault contents are NOT included —
 * those are separately protected by the vault master password.
 */

interface Snapshot {
  version: 1;
  createdAt: number;
  bookmarks: unknown[];
  barTree: unknown[];
  aliases: unknown[];
  settings: Record<string, string>;
}

interface Envelope {
  magic: "inix-backup-v1";
  salt: string; // base64
  iv: string; // base64
  tag: string; // base64
  data: string; // base64 ciphertext
  iterations: number;
}

const PBKDF2_ITERATIONS = 200_000;
const KEY_LEN = 32;

function buildSnapshot(): Snapshot {
  // Convert BarNode → ImportBarNode-compatible tree (already the same shape)
  return {
    version: 1,
    createdAt: Date.now(),
    bookmarks: listBookmarks(),
    barTree: getBarTree(),
    aliases: listAliases(),
    settings: getAllSettings(),
  };
}

function encryptSnapshot(snapshot: Snapshot, passphrase: string): Envelope {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LEN, "sha256");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(snapshot), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    magic: "inix-backup-v1",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
    iterations: PBKDF2_ITERATIONS,
  };
}

function decryptSnapshot(env: Envelope, passphrase: string): Snapshot {
  if (env.magic !== "inix-backup-v1") throw new Error("Not an Inix backup file");
  const salt = Buffer.from(env.salt, "base64");
  const key = crypto.pbkdf2Sync(passphrase, salt, env.iterations ?? PBKDF2_ITERATIONS, KEY_LEN, "sha256");
  const iv = Buffer.from(env.iv, "base64");
  const tag = Buffer.from(env.tag, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(Buffer.from(env.data, "base64")), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as Snapshot;
}

export async function exportEncrypted(
  win: BrowserWindow | null,
  passphrase: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!passphrase || passphrase.length < 8) {
    return { ok: false, error: "Passphrase must be at least 8 characters" };
  }
  const result = await dialog.showSaveDialog(win ?? undefined!, {
    title: "Export Inix backup",
    defaultPath: `inix-backup-${new Date().toISOString().slice(0, 10)}.inixbak`,
    filters: [{ name: "Inix backup", extensions: ["inixbak"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, error: "Cancelled" };
  try {
    const snapshot = buildSnapshot();
    const envelope = encryptSnapshot(snapshot, passphrase);
    fs.writeFileSync(result.filePath, JSON.stringify(envelope, null, 2), "utf8");
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function importEncrypted(
  win: BrowserWindow | null,
  passphrase: string,
): Promise<{ ok: boolean; imported?: { bookmarks: number; aliases: number; settings: number }; error?: string }> {
  const result = await dialog.showOpenDialog(win ?? undefined!, {
    title: "Import Inix backup",
    filters: [{ name: "Inix backup", extensions: ["inixbak", "json"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, error: "Cancelled" };
  try {
    const raw = fs.readFileSync(result.filePaths[0], "utf8");
    const envelope = JSON.parse(raw) as Envelope;
    const snapshot = decryptSnapshot(envelope, passphrase);

    // Restore settings (non-destructive: overwrite each key)
    let settingsCount = 0;
    for (const [key, val] of Object.entries(snapshot.settings ?? {})) {
      setSetting(key, val);
      settingsCount++;
    }

    // Restore aliases
    let aliasCount = 0;
    for (const a of (snapshot.aliases ?? []) as Array<{ alias: string; url: string; title?: string }>) {
      if (a.alias && a.url) {
        setAlias(a.alias, a.url, a.title ?? "");
        aliasCount++;
      }
    }

    // Restore bookmark bar tree (replaces existing)
    if (Array.isArray(snapshot.barTree) && snapshot.barTree.length > 0) {
      importBarTree(snapshot.barTree as ImportBarNode[], true);
    }

    // Restore bookmarks — merge by URL (skip existing to avoid duplicates)
    const db = getDb();
    let bookmarkCount = 0;
    const existing = new Set(
      db.exec("SELECT url FROM bookmarks")[0]?.values.map((r) => String(r[0])) ?? [],
    );
    const bookmarks = (snapshot.bookmarks ?? []) as Array<{
      url: string;
      title: string;
      description?: string;
      tags?: string[];
      created_at?: number;
    }>;
    for (const bm of bookmarks) {
      if (!bm.url || existing.has(bm.url)) continue;
      db.run(
        "INSERT INTO bookmarks (url, title, created_at) VALUES (?, ?, ?)",
        [bm.url, bm.title ?? "", bm.created_at ?? Date.now()],
      );
      bookmarkCount++;
    }
    saveDatabase();

    return {
      ok: true,
      imported: { bookmarks: bookmarkCount, aliases: aliasCount, settings: settingsCount },
    };
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("Unsupported state") || msg.includes("auth")) {
      return { ok: false, error: "Wrong passphrase or corrupted backup" };
    }
    return { ok: false, error: msg };
  }
}
