import crypto from "node:crypto";
import fs from "node:fs";
import { dpapiUnprotect } from "./dpapi";

export function getChromiumEncryptionKey(localStatePath: string): Buffer | null {
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

export function decryptChromiumAesGcm(encrypted: Buffer, aesKey: Buffer): string | null {
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
