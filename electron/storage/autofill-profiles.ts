import { runQuery, runExec, saveDatabase, lastInsertId } from "./db";
import {
  encryptVaultPayload,
  decryptVaultPayload,
  hasVaultKey,
} from "./vault-crypto";
import { isVaultUnlocked } from "./vault";

export interface AutofillProfileMeta {
  id: number;
  label: string;
  is_default: boolean;
  created_at: number;
}

export interface AutofillProfileData {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  cardNumber: string;
  cardName: string;
  cardExpiry: string;
  cardCvc: string;
}

const EMPTY_DATA: AutofillProfileData = {
  fullName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  cardNumber: "",
  cardName: "",
  cardExpiry: "",
  cardCvc: "",
};

function requireUnlocked(): void {
  if (!isVaultUnlocked() || !hasVaultKey()) {
    throw new Error("Vault locked");
  }
}

export function listAutofillProfiles(): AutofillProfileMeta[] {
  return runQuery<AutofillProfileMeta>(
    "SELECT id, label, is_default, created_at FROM vault_autofill_profiles ORDER BY is_default DESC, created_at ASC"
  );
}

export function getAutofillProfileData(id: number): AutofillProfileData | null {
  if (!isVaultUnlocked()) return null;
  const rows = runQuery<{ payload: string }>(
    "SELECT payload FROM vault_autofill_profiles WHERE id = ?",
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  try {
    return decryptVaultPayload<AutofillProfileData>(row.payload);
  } catch {
    return null;
  }
}

export function createAutofillProfile(label: string): AutofillProfileMeta {
  requireUnlocked();
  const now = Date.now();
  const payload = encryptVaultPayload(EMPTY_DATA);
  const count = runQuery<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM vault_autofill_profiles")[0]?.cnt ?? 0;
  const isDefault = count === 0 ? 1 : 0;

  runExec(
    "INSERT INTO vault_autofill_profiles (label, is_default, payload, created_at) VALUES (?, ?, ?, ?)",
    [label.trim() || "Profile", isDefault, payload, now]
  );
  const id = lastInsertId();
  saveDatabase();
  return { id, label: label.trim() || "Profile", is_default: isDefault === 1, created_at: now };
}

export function updateAutofillProfile(id: number, label: string, data: AutofillProfileData): boolean {
  requireUnlocked();
  const payload = encryptVaultPayload(data);
  runExec(
    "UPDATE vault_autofill_profiles SET label = ?, payload = ? WHERE id = ?",
    [label.trim(), payload, id]
  );
  saveDatabase();
  return true;
}

export function setDefaultAutofillProfile(id: number): void {
  runExec("UPDATE vault_autofill_profiles SET is_default = 0");
  runExec("UPDATE vault_autofill_profiles SET is_default = 1 WHERE id = ?", [id]);
  saveDatabase();
}

export function removeAutofillProfile(id: number): boolean {
  const rows = runQuery<{ is_default: number }>(
    "SELECT is_default FROM vault_autofill_profiles WHERE id = ?",
    [id]
  );
  runExec("DELETE FROM vault_autofill_profiles WHERE id = ?", [id]);
  if (rows[0]?.is_default === 1) {
    const next = runQuery<{ id: number }>(
      "SELECT id FROM vault_autofill_profiles ORDER BY created_at ASC LIMIT 1"
    );
    if (next[0]) {
      runExec("UPDATE vault_autofill_profiles SET is_default = 1 WHERE id = ?", [next[0].id]);
    }
  }
  saveDatabase();
  return true;
}

export function reencryptAllAutofillProfiles(): void {
  const rows = runQuery<{ id: number; payload: string }>(
    "SELECT id, payload FROM vault_autofill_profiles"
  );
  for (const row of rows) {
    try {
      const plain = decryptVaultPayload<AutofillProfileData>(row.payload);
      const reencrypted = encryptVaultPayload(plain);
      runExec("UPDATE vault_autofill_profiles SET payload = ? WHERE id = ?", [reencrypted, row.id]);
    } catch {
      // skip
    }
  }
}
