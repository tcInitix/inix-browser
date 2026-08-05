import fs from "node:fs";
import path from "node:path";
import type { Session } from "electron";
import type { SqlValue } from "sql.js";
import { getChromiumEncryptionKey, decryptChromiumAesGcm } from "../import/chromium-crypto";
import { dpapiUnprotect, isDpapiAvailable } from "../import/dpapi";
import { queryExternalSqlite } from "../import/sqlite-read";
import { formatLockedBrowserDbError, snapshotChromiumSqlite } from "../import/sqlite-snapshot";
import { getAuthBrowserUserDataDir, type AuthBrowser } from "./browser-launcher";

export interface GoogleCookieImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
  error?: string;
}

const GOOGLE_HOST_FRAGMENTS = [
  "google",
  "youtube",
  "googleapis",
  "gstatic",
  "googlevideo",
  "ytimg",
  "ggpht",
  "gvt1",
];

interface CookieRow extends Record<string, SqlValue> {
  host_key: string;
  name: string;
  value: string;
  encrypted_value: SqlValue;
  path: string;
  expires_utc: number;
  is_secure: number;
  is_httponly: number;
  samesite: number;
}

function getChromiumUserDataDir(browser: AuthBrowser): string | null {
  const dir = getAuthBrowserUserDataDir(browser);
  return fs.existsSync(dir) ? dir : null;
}

function cookiesDbPath(userDataDir: string, profileId = "Default"): string | null {
  const network = path.join(userDataDir, profileId, "Network", "Cookies");
  if (fs.existsSync(network)) return network;
  const legacy = path.join(userDataDir, profileId, "Cookies");
  return fs.existsSync(legacy) ? legacy : null;
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "binary");
  return Buffer.alloc(0);
}

function decryptCookieValue(encrypted: Buffer, aesKey: Buffer | null): string | null {
  if (encrypted.length === 0) return "";
  const prefix = encrypted.slice(0, 3).toString("utf8");
  if (prefix === "v20") return null;
  if (prefix === "v10" || prefix === "v11") {
    if (!aesKey) return null;
    return decryptChromiumAesGcm(encrypted, aesKey);
  }
  if (isDpapiAvailable()) {
    const plain = dpapiUnprotect(encrypted);
    return plain?.toString("utf8") ?? null;
  }
  return null;
}

function chromeExpiryToUnix(expiresUtc: number): number | undefined {
  if (!expiresUtc) return undefined;
  const unixSeconds = Math.floor(expiresUtc / 1_000_000 - 11_644_473_600);
  if (unixSeconds <= 0) return undefined;
  return unixSeconds;
}

function mapSameSite(value: number): "unspecified" | "no_restriction" | "lax" | "strict" {
  switch (value) {
    case 0:
      return "no_restriction";
    case 1:
      return "lax";
    case 2:
      return "strict";
    default:
      return "unspecified";
  }
}

function cookieUrl(hostKey: string, cookiePath: string, secure: boolean): string {
  const host = hostKey.startsWith(".") ? hostKey.slice(1) : hostKey;
  const normalizedPath = cookiePath.startsWith("/") ? cookiePath : `/${cookiePath}`;
  return `${secure ? "https" : "http"}://${host}${normalizedPath || "/"}`;
}

function isGoogleRelatedHost(hostKey: string): boolean {
  const lower = hostKey.toLowerCase();
  return GOOGLE_HOST_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

export async function importGoogleCookiesIntoSession(
  sess: Session,
  browser: AuthBrowser
): Promise<GoogleCookieImportResult> {
  if (process.platform !== "win32") {
    return { ok: false, imported: 0, skipped: 0, error: "Google session import is only supported on Windows." };
  }

  const userDataDir = getChromiumUserDataDir(browser);
  if (!userDataDir) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      error: `No Inix sign-in profile found for ${browser === "chrome" ? "Chrome" : "Edge"}. Open ${browser === "chrome" ? "Chrome" : "Edge"} from this prompt and sign in first.`,
    };
  }

  const dbPath = cookiesDbPath(userDataDir);
  if (!dbPath) {
    return { ok: false, imported: 0, skipped: 0, error: "Could not locate browser cookies." };
  }

  const localStatePath = path.join(userDataDir, "Local State");
  const aesKey = fs.existsSync(localStatePath) ? getChromiumEncryptionKey(localStatePath) : null;
  const browserLabel = browser === "chrome" ? "Chrome" : "Microsoft Edge";

  let snapshot: Awaited<ReturnType<typeof snapshotChromiumSqlite>>;
  try {
    snapshot = await snapshotChromiumSqlite(dbPath, "inix-cookies");
  } catch (err) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      error: formatLockedBrowserDbError(browserLabel, err),
    };
  }

  try {
    const rows = await queryExternalSqlite<CookieRow>(
      snapshot.dbPath,
      `SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite
       FROM cookies`
    );

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!isGoogleRelatedHost(row.host_key)) continue;

      let value = row.value ?? "";
      if (!value) {
        const encrypted = toBuffer(row.encrypted_value);
        const decrypted = decryptCookieValue(encrypted, aesKey);
        if (decrypted === null) {
          skipped += 1;
          continue;
        }
        value = decrypted;
      }

      const secure = row.is_secure === 1;
      const url = cookieUrl(row.host_key, row.path || "/", secure);

      try {
        await sess.cookies.set({
          url,
          name: row.name,
          value,
          domain: row.host_key.startsWith(".") ? row.host_key : undefined,
          path: row.path || "/",
          secure,
          httpOnly: row.is_httponly === 1,
          sameSite: mapSameSite(row.samesite),
          expirationDate: chromeExpiryToUnix(row.expires_utc),
        });
        imported += 1;
      } catch {
        skipped += 1;
      }
    }

    if (imported === 0) {
      return {
        ok: false,
        imported: 0,
        skipped,
        error:
          skipped > 0
            ? `No Google cookies could be imported. Close all ${browserLabel} windows and try again.`
            : "No Google sign-in cookies were found. Finish signing in with Google in your browser first.",
      };
    }

    return { ok: true, imported, skipped };
  } catch (err) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      error: formatLockedBrowserDbError(browserLabel, err),
    };
  } finally {
    snapshot.cleanup();
  }
}
