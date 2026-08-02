import { runQuery, runExec, saveDatabase, lastInsertId } from "./db";
import {
  encryptVaultPayload,
  decryptVaultPayload,
  hasVaultKey,
} from "./vault-crypto";
import { isVaultUnlocked, touchVaultActivity } from "./vault";

export interface StoredCredential {
  id: number;
  origin: string;
  username: string;
  title: string;
  created_at: number;
  updated_at: number;
}

interface CredentialPayload {
  username: string;
  password: string;
  origin: string;
  title: string;
}

export interface CredentialImportItem {
  origin: string;
  username: string;
  password: string;
  title: string;
}

export interface CredentialImportResult {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
}

function requireUnlocked(): void {
  if (!isVaultUnlocked() || !hasVaultKey()) {
    throw new Error("Vault locked");
  }
}

function credentialKey(origin: string, username: string): string {
  return `${origin}\x00${username}`;
}

export function listCredentials(): StoredCredential[] {
  const rows = runQuery<{
    id: number;
    origin: string;
    username_hint: string;
    title: string;
    payload: string;
    created_at: number;
    updated_at: number;
  }>(
    "SELECT id, origin, username_hint, title, payload, created_at, updated_at FROM vault_credentials ORDER BY updated_at DESC"
  );

  const unlocked = isVaultUnlocked() && hasVaultKey();
  const out: StoredCredential[] = [];

  for (const row of rows) {
    if (unlocked) {
      try {
        const data = decryptVaultPayload<CredentialPayload>(row.payload);
        out.push({
          id: row.id,
          origin: row.origin,
          username: data.username,
          title: data.title || row.title,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
        continue;
      } catch {
        // Fall back to stored hints if payload cannot be decrypted.
      }
    }

    out.push({
      id: row.id,
      origin: row.origin || "",
      username: "",
      title: "",
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  return out;
}

export function credentialsForOrigin(origin: string): Array<{ id: number; username: string }> {
  const rows = runQuery<{ id: number; username_hint: string }>(
    "SELECT id, username_hint FROM vault_credentials WHERE origin = ? ORDER BY updated_at DESC",
    [origin]
  );
  return rows.map((r) => ({ id: r.id, username: r.username_hint }));
}

export function getCredentialPassword(id: number): string | null {
  if (!isVaultUnlocked()) return null;
  const rows = runQuery<{ payload: string }>(
    "SELECT payload FROM vault_credentials WHERE id = ?",
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  try {
    const data = decryptVaultPayload<CredentialPayload>(row.payload);
    return data.password;
  } catch {
    return null;
  }
}

export function credentialExists(origin: string, username: string): boolean {
  const rows = runQuery<{ id: number }>(
    "SELECT id FROM vault_credentials WHERE origin = ? AND username_hint = ? LIMIT 1",
    [origin, username]
  );
  return rows.length > 0;
}

export function saveCredential(
  origin: string,
  username: string,
  password: string,
  title: string,
  options?: { persist?: boolean }
): number {
  requireUnlocked();
  touchVaultActivity();
  const now = Date.now();
  const payload = encryptVaultPayload({ username, password, origin, title });
  const persist = options?.persist !== false;

  const existing = runQuery<{ id: number }>(
    "SELECT id FROM vault_credentials WHERE origin = ? AND username_hint = ? LIMIT 1",
    [origin, username]
  );

  if (existing[0]) {
    runExec(
      "UPDATE vault_credentials SET payload = ?, title = ?, updated_at = ? WHERE id = ?",
      [payload, title, now, existing[0].id]
    );
    if (persist) saveDatabase();
    return existing[0].id;
  }

  runExec(
    "INSERT INTO vault_credentials (origin, username_hint, title, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [origin, username, title, payload, now, now]
  );
  const id = lastInsertId();
  if (persist) saveDatabase();
  return id;
}

export function saveCredentialsBatch(
  items: CredentialImportItem[],
  options?: {
    persist?: boolean;
    onProgress?: (current: number, total: number) => void;
  }
): CredentialImportResult {
  requireUnlocked();

  const persist = options?.persist !== false;
  const now = Date.now();
  const existingRows = runQuery<{ id: number; origin: string; username_hint: string }>(
    "SELECT id, origin, username_hint FROM vault_credentials"
  );
  const existingIds = new Map(
    existingRows.map((row) => [credentialKey(row.origin, row.username_hint), row.id])
  );

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    touchVaultActivity();
    options?.onProgress?.(i + 1, items.length);

    if (!item.origin || !item.username) {
      skipped++;
      continue;
    }

    try {
      const payload = encryptVaultPayload({
        username: item.username,
        password: item.password,
        origin: item.origin,
        title: item.title,
      });
      const key = credentialKey(item.origin, item.username);
      const existingId = existingIds.get(key);

      if (existingId != null) {
        runExec(
          "UPDATE vault_credentials SET payload = ?, title = ?, updated_at = ? WHERE id = ?",
          [payload, item.title, now, existingId]
        );
        updated++;
      } else {
        runExec(
          "INSERT INTO vault_credentials (origin, username_hint, title, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [item.origin, item.username, item.title, payload, now, now]
        );
        existingIds.set(key, lastInsertId());
        imported++;
      }
    } catch {
      failed++;
    }
  }

  if (persist) saveDatabase();
  return { imported, updated, skipped, failed };
}

export function removeCredential(id: number): void {
  runExec("DELETE FROM vault_credentials WHERE id = ?", [id]);
  saveDatabase();
}

export function reencryptAllCredentials(): void {
  const rows = runQuery<{ id: number; payload: string }>("SELECT id, payload FROM vault_credentials");
  for (const row of rows) {
    try {
      const plain = decryptVaultPayload<CredentialPayload>(row.payload);
      const reencrypted = encryptVaultPayload(plain);
      runExec("UPDATE vault_credentials SET payload = ? WHERE id = ?", [reencrypted, row.id]);
    } catch {
      // skip
    }
  }
}
