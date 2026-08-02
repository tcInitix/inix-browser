import crypto from "node:crypto";
import fs from "node:fs";
import type { SqlValue } from "sql.js";
import os from "node:os";
import path from "node:path";
import { saveCredentialsBatch, type CredentialImportItem } from "../storage/credentials";
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
  parsed?: number;
  decrypted?: number;
  undecryptable?: number;
  appBound?: number;
}

export type ImportPasswordProgress = {
  phase: "reading" | "decrypting" | "saving";
  current: number;
  total: number;
};

const YIELD_EVERY = 15;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function urlToOrigin(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
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

function decryptChromePassword(
  encrypted: Buffer,
  aesKey: Buffer | null
): { password: string | null; appBound?: boolean } {
  if (encrypted.length === 0) return { password: "" };

  const prefix = encrypted.slice(0, 3).toString("utf8");
  if (prefix === "v20") {
    return { password: null, appBound: true };
  }

  if (prefix === "v10" || prefix === "v11") {
    if (!aesKey) return { password: null };
    const nonce = encrypted.slice(3, 15);
    const payload = encrypted.slice(15);
    if (payload.length < 16) return { password: null };
    const tag = payload.slice(-16);
    const ciphertext = payload.slice(0, -16);
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, nonce);
      decipher.setAuthTag(tag);
      return {
        password: Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"),
      };
    } catch {
      return { password: null };
    }
  }

  if (!isDpapiAvailable()) return { password: null };
  try {
    return { password: dpapiUnprotect(encrypted).toString("utf8") };
  } catch {
    return { password: null };
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

async function importPasswordRows(
  rows: CredentialImportItem[],
  onProgress?: (progress: ImportPasswordProgress) => void
): Promise<Omit<ImportPasswordsResult, "parsed" | "decrypted" | "undecryptable" | "appBound">> {
  if (!isVaultUnlocked()) {
    throw new Error("Unlock the vault before importing passwords.");
  }

  onProgress?.({ phase: "saving", current: 0, total: rows.length });
  await yieldToEventLoop();

  const result = saveCredentialsBatch(rows, {
    persist: false,
    onProgress: (current, total) => {
      onProgress?.({ phase: "saving", current, total });
    },
  });

  await yieldToEventLoop();
  saveDatabase();

  return result;
}

export async function importChromePasswordsFromProfile(
  profileDir: string,
  onProgress?: (progress: ImportPasswordProgress) => void
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
    onProgress?.({ phase: "reading", current: 0, total: 1 });
    await yieldToEventLoop();

    const logins = await queryExternalSqlite<{
      origin_url: string;
      username_value: string;
      password_value: SqlValue;
    }>(
      copy.path,
      "SELECT origin_url, username_value, password_value FROM logins WHERE blacklisted_by_user = 0"
    );

    const parsed = logins.length;
    const rows: CredentialImportItem[] = [];
    let undecryptable = 0;
    let appBound = 0;

    onProgress?.({ phase: "decrypting", current: 0, total: parsed });
    for (let i = 0; i < logins.length; i++) {
      const login = logins[i];
      const encrypted = toBuffer(login.password_value);
      const decrypted = decryptChromePassword(encrypted, aesKey);
      if (decrypted.password == null) {
        undecryptable++;
        if (decrypted.appBound) appBound++;
      } else {
        const url = String(login.origin_url ?? "");
        const origin = urlToOrigin(url);
        rows.push({
          origin,
          username: String(login.username_value ?? "").trim(),
          password: decrypted.password,
          title: url.trim() || origin,
        });
      }

      if (i > 0 && i % YIELD_EVERY === 0) {
        onProgress?.({ phase: "decrypting", current: i, total: parsed });
        await yieldToEventLoop();
      }
    }

    const saved = await importPasswordRows(rows, onProgress);
    return {
      ...saved,
      parsed,
      decrypted: rows.length,
      undecryptable,
      appBound,
    };
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

export async function importPasswordsFromCsvText(
  text: string,
  onProgress?: (progress: ImportPasswordProgress) => void
): Promise<ImportPasswordsResult> {
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

  const rows: CredentialImportItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const url = cols[urlIdx] ?? "";
    rows.push({
      title: nameIdx >= 0 ? cols[nameIdx] ?? "" : "",
      origin: urlToOrigin(url),
      username: (cols[userIdx] ?? "").trim(),
      password: cols[passIdx] ?? "",
    });
  }

  const saved = await importPasswordRows(rows, onProgress);
  return {
    ...saved,
    parsed: rows.length,
    decrypted: rows.length,
  };
}

export async function importPasswordsFromCsvFile(
  filePath: string,
  onProgress?: (progress: ImportPasswordProgress) => void
): Promise<ImportPasswordsResult> {
  const text = fs.readFileSync(filePath, "utf8");
  return importPasswordsFromCsvText(text, onProgress);
}
