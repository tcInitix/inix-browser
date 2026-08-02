import crypto from "node:crypto";
import fs from "node:fs";
import type { SqlValue } from "sql.js";
import os from "node:os";
import path from "node:path";
import { saveCredential, credentialExists } from "../storage/credentials";
import { saveDatabase } from "../storage/db";
import { isVaultUnlocked } from "../storage/vault";
import { dpapiUnprotect, isDpapiAvailable } from "./dpapi";
import { getChromeProfilePaths } from "./chrome-paths";
import { queryExternalSqlite } from "./sqlite-read";

export interface ImportPasswordsResult {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
}

function urlToOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function getChromeEncryptionKey(localStatePath: string): Buffer | null {
  const state = JSON.parse(fs.readFileSync(localStatePath, "utf8")) as {
    os_crypt?: { encrypted_key?: string };
  };
  const encryptedKeyB64 = state?.os_crypt?.encrypted_key;
  if (!encryptedKeyB64) return null;

  const encryptedKey = Buffer.from(encryptedKeyB64, "base64");
  if (encryptedKey.length < 5 || encryptedKey.slice(0, 5).toString() !== "DPAPI") {
    return null;
  }
  return dpapiUnprotect(encryptedKey.slice(5));
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "binary");
  return Buffer.alloc(0);
}

function decryptChromePassword(encrypted: Buffer, aesKey: Buffer | null): string | null {
  if (encrypted.length === 0) return "";

  const prefix = encrypted.slice(0, 3).toString("utf8");
  if (prefix === "v10" || prefix === "v11") {
    if (!aesKey) return null;
    const nonce = encrypted.slice(3, 15);
    const payload = encrypted.slice(15);
    if (payload.length < 16) return null;
    const tag = payload.slice(-16);
    const ciphertext = payload.slice(0, -16);
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, nonce);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }

  if (!isDpapiAvailable()) return null;
  try {
    return dpapiUnprotect(encrypted).toString("utf8");
  } catch {
    return null;
  }
}

function copyForRead(src: string): { path: string; cleanup: () => void } {
  const tmp = path.join(os.tmpdir(), `inix-import-${Date.now()}-${path.basename(src)}`);
  fs.copyFileSync(src, tmp);
  return {
    path: tmp,
    cleanup: () => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    },
  };
}

const IMPORT_YIELD_EVERY = 50;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function importPasswordRows(
  rows: Array<{ url: string; username: string; password: string; title: string }>
): Promise<ImportPasswordsResult> {
  if (!isVaultUnlocked()) {
    throw new Error("Unlock the vault before importing passwords.");
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const origin = urlToOrigin(row.url);
    const username = row.username.trim();
    const password = row.password;
    const title = row.title.trim() || origin;

    if (!origin || !username || !password) {
      skipped++;
      continue;
    }

    try {
      const existed = credentialExists(origin, username);
      saveCredential(origin, username, password, title, { persist: false });
      if (existed) updated++;
      else imported++;
    } catch {
      failed++;
    }

    if (i > 0 && i % IMPORT_YIELD_EVERY === 0) {
      await yieldToEventLoop();
    }
  }

  saveDatabase();
  return { imported, updated, skipped, failed };
}

export async function importChromePasswordsFromProfile(
  profileDir: string
): Promise<ImportPasswordsResult> {
  if (!isDpapiAvailable()) {
    throw new Error(
      "Direct Chrome password import requires Windows. Use Chrome's password export (CSV) instead."
    );
  }

  const { loginData, localState } = getChromeProfilePaths(profileDir);
  if (!fs.existsSync(loginData)) {
    throw new Error("Chrome Login Data not found for this profile.");
  }
  if (!fs.existsSync(localState)) {
    throw new Error("Chrome Local State file not found.");
  }

  const aesKey = getChromeEncryptionKey(localState);
  const copy = copyForRead(loginData);

  try {
    const logins = await queryExternalSqlite<{
      origin_url: string;
      username_value: string;
      password_value: SqlValue;
    }>(
      copy.path,
      "SELECT origin_url, username_value, password_value FROM logins WHERE blacklisted_by_user = 0"
    );

    const rows: Array<{ url: string; username: string; password: string; title: string }> = [];
    for (let i = 0; i < logins.length; i++) {
      const login = logins[i];
      const encrypted = toBuffer(login.password_value);
      const password = decryptChromePassword(encrypted, aesKey);
      if (password == null) continue;
      rows.push({
        url: String(login.origin_url ?? ""),
        username: String(login.username_value ?? ""),
        password,
        title: String(login.origin_url ?? ""),
      });
      if (i > 0 && i % IMPORT_YIELD_EVERY === 0) {
        await yieldToEventLoop();
      }
    }

    return await importPasswordRows(rows);
  } finally {
    copy.cleanup();
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export async function importPasswordsFromCsvText(text: string): Promise<ImportPasswordsResult> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    throw new Error("CSV file is empty or missing data rows.");
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  const urlIdx = header.indexOf("url");
  const userIdx = header.indexOf("username");
  const passIdx = header.indexOf("password");

  if (urlIdx < 0 || userIdx < 0 || passIdx < 0) {
    throw new Error('CSV must include "url", "username", and "password" columns (Chrome export format).');
  }

  const rows: Array<{ url: string; username: string; password: string; title: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    rows.push({
      title: nameIdx >= 0 ? cols[nameIdx] ?? "" : "",
      url: cols[urlIdx] ?? "",
      username: cols[userIdx] ?? "",
      password: cols[passIdx] ?? "",
    });
  }

  return await importPasswordRows(rows);
}

export async function importPasswordsFromCsvFile(filePath: string): Promise<ImportPasswordsResult> {
  const text = fs.readFileSync(filePath, "utf8");
  return await importPasswordsFromCsvText(text);
}
