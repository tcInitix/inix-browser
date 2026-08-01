import { runQuery, runExec, saveDatabase, lastInsertId } from "./db";
import {
  encryptVaultPayload,
  decryptVaultPayload,
  hasVaultKey,
} from "./vault-crypto";
import { isVaultUnlocked } from "./vault";

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

function requireUnlocked(): void {
  if (!isVaultUnlocked() || !hasVaultKey()) {
    throw new Error("Vault locked");
  }
}

export function listCredentials(): StoredCredential[] {
  if (!isVaultUnlocked()) return [];
  const rows = runQuery<{
    id: number;
    origin: string;
    username_hint: string;
    payload: string;
    created_at: number;
    updated_at: number;
  }>("SELECT id, origin, username_hint, payload, created_at, updated_at FROM vault_credentials ORDER BY updated_at DESC");

  const out: StoredCredential[] = [];
  for (const row of rows) {
    try {
      const data = decryptVaultPayload<CredentialPayload>(row.payload);
      out.push({
        id: row.id,
        origin: row.origin,
        username: data.username,
        title: data.title,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    } catch {
      // skip corrupt
    }
  }
  return out;
}

export function credentialsForOrigin(origin: string): Array<{ id: number; username: string }> {
  if (!isVaultUnlocked()) return [];
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
  title: string
): number {
  requireUnlocked();
  const now = Date.now();
  const payload = encryptVaultPayload({ username, password, origin, title });

  const existing = runQuery<{ id: number }>(
    "SELECT id FROM vault_credentials WHERE origin = ? AND username_hint = ? LIMIT 1",
    [origin, username]
  );

  if (existing[0]) {
    runExec(
      "UPDATE vault_credentials SET payload = ?, title = ?, updated_at = ? WHERE id = ?",
      [payload, title, now, existing[0].id]
    );
    saveDatabase();
    return existing[0].id;
  }

  runExec(
    "INSERT INTO vault_credentials (origin, username_hint, title, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [origin, username, title, payload, now, now]
  );
  const id = lastInsertId();
  saveDatabase();
  return id;
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
