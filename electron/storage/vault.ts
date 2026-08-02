import crypto from "node:crypto";
import { runQuery, runExec, saveDatabase } from "./db";
import {
  setVaultKey,
  deriveVaultKey,
  computeVaultVerifier,
  encryptVaultPayload,
  decryptVaultPayload,
  hasVaultKey,
} from "./vault-crypto";
import { reencryptAllCredentials } from "./credentials";
import { reencryptAllAutofillProfiles } from "./autofill-profiles";

const PBKDF2_ITERATIONS = 100_000;
const VERIFIER_NONCE = "inix-vault-v1";
const IDLE_LOCK_MS = 30 * 60_000;

export interface VaultEntry {
  id: number;
  url: string;
  title: string;
  visited_at: number;
  text?: string;
}

interface VaultConfig {
  salt: string;
  iterations: number;
  verifier: string;
}

let idleTimer: ReturnType<typeof setTimeout> | null = null;

function getConfig(): VaultConfig | null {
  const rows = runQuery<{ salt: string; iterations: number; verifier: string }>(
    "SELECT salt, iterations, verifier FROM vault_config LIMIT 1"
  );
  return rows[0] ?? null;
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => lockVault(), IDLE_LOCK_MS);
}

export function isVaultConfigured(): boolean {
  return !!getConfig();
}

export function isVaultUnlocked(): boolean {
  return hasVaultKey();
}

export function setupVault(password: string): { ok: boolean; error?: string } {
  if (!password || password.length < 4) {
    return { ok: false, error: "Password must be at least 4 characters" };
  }
  if (getConfig()) {
    return { ok: false, error: "Vault already configured" };
  }

  const salt = crypto.randomBytes(16);
  const key = deriveVaultKey(password, salt, PBKDF2_ITERATIONS);
  const verifier = computeVaultVerifier(key, VERIFIER_NONCE);

  runExec(
    "INSERT INTO vault_config (id, salt, iterations, verifier) VALUES (1, ?, ?, ?)",
    [salt.toString("base64"), PBKDF2_ITERATIONS, verifier]
  );
  saveDatabase();

  setVaultKey(key);
  resetIdleTimer();
  return { ok: true };
}

export function unlockVault(password: string): { ok: boolean; error?: string } {
  const config = getConfig();
  if (!config) return { ok: false, error: "Vault not configured" };

  const salt = Buffer.from(config.salt, "base64");
  const key = deriveVaultKey(password, salt, config.iterations);
  if (computeVaultVerifier(key, VERIFIER_NONCE) !== config.verifier) {
    return { ok: false, error: "Incorrect password" };
  }

  setVaultKey(key);
  resetIdleTimer();
  return { ok: true };
}

export function lockVault(): void {
  setVaultKey(null);
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

export function changeVaultPassword(
  oldPassword: string,
  newPassword: string
): { ok: boolean; error?: string } {
  const unlock = unlockVault(oldPassword);
  if (!unlock.ok) return unlock;
  if (!newPassword || newPassword.length < 4) {
    lockVault();
    return { ok: false, error: "New password must be at least 4 characters" };
  }

  const salt = crypto.randomBytes(16);
  const key = deriveVaultKey(newPassword, salt, PBKDF2_ITERATIONS);
  const verifier = computeVaultVerifier(key, VERIFIER_NONCE);

  runExec("DELETE FROM vault_config");
  runExec(
    "INSERT INTO vault_config (id, salt, iterations, verifier) VALUES (1, ?, ?, ?)",
    [salt.toString("base64"), PBKDF2_ITERATIONS, verifier]
  );

  const entries = runQuery<{ id: number; payload: string }>("SELECT id, payload FROM vault_history");
  for (const entry of entries) {
    try {
      const plain = decryptVaultPayload<VaultEntry>(entry.payload);
      const reencrypted = encryptVaultPayload(plain);
      runExec("UPDATE vault_history SET payload = ? WHERE id = ?", [reencrypted, entry.id]);
    } catch {
      // skip corrupt entries
    }
  }

  reencryptAllCredentials();
  reencryptAllAutofillProfiles();

  saveDatabase();
  setVaultKey(key);
  resetIdleTimer();
  return { ok: true };
}

export function saveVaultEntry(entry: Omit<VaultEntry, "id">): number {
  resetIdleTimer();
  const payload = encryptVaultPayload(entry);
  runExec("INSERT INTO vault_history (payload, created_at) VALUES (?, ?)", [
    payload,
    entry.visited_at,
  ]);
  const id = runQuery<{ id: number }>("SELECT last_insert_rowid() AS id")[0]?.id ?? 0;
  saveDatabase();
  return id;
}

export function listVaultEntries(limit = 100): VaultEntry[] {
  if (!isVaultUnlocked()) return [];
  resetIdleTimer();
  const rows = runQuery<{ id: number; payload: string }>(
    "SELECT id, payload FROM vault_history ORDER BY created_at DESC LIMIT ?",
    [limit]
  );
  const out: VaultEntry[] = [];
  for (const row of rows) {
    try {
      const entry = decryptVaultPayload<VaultEntry>(row.payload);
      out.push({ ...entry, id: row.id });
    } catch {
      // skip
    }
  }
  return out;
}

export function moveHistoryEntryToVault(
  url: string,
  title: string,
  visitedAt: number,
  text?: string
): number {
  return saveVaultEntry({ url, title, visited_at: visitedAt, text });
}

export function clearVaultHistory(): void {
  runExec("DELETE FROM vault_history");
  saveDatabase();
}

export function removeVaultEntry(id: number): void {
  runExec("DELETE FROM vault_history WHERE id = ?", [id]);
  saveDatabase();
}

export function onAppQuitVault(): void {
  lockVault();
}

/** Wipe vault passwords, history, autofill profiles, and master password config. */
export function destroyVault(): void {
  lockVault();
  runExec("DELETE FROM vault_history");
  runExec("DELETE FROM vault_credentials");
  runExec("DELETE FROM vault_autofill_profiles");
  runExec("DELETE FROM vault_config");
  saveDatabase();
}
