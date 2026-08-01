import crypto from "node:crypto";

const KEY_LEN = 32;

let derivedKey: Buffer | null = null;

export function setVaultKey(key: Buffer | null): void {
  derivedKey = key;
}

export function hasVaultKey(): boolean {
  return derivedKey !== null;
}

export function deriveVaultKey(password: string, salt: Buffer, iterations: number): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_LEN, "sha256");
}

export function computeVaultVerifier(key: Buffer, nonce: string): string {
  return crypto.createHmac("sha256", key).update(nonce).digest("base64");
}

export function encryptVaultPayload(data: object): string {
  if (!derivedKey) throw new Error("Vault locked");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv);
  const json = JSON.stringify(data);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    data: enc.toString("base64"),
    tag: tag.toString("base64"),
  });
}

export function decryptVaultPayload<T>(payload: string): T {
  if (!derivedKey) throw new Error("Vault locked");
  const { iv, data, tag } = JSON.parse(payload) as { iv: string; data: string; tag: string };
  const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
  return JSON.parse(dec.toString("utf8")) as T;
}
