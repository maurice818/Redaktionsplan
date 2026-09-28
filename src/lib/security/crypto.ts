import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

/**
 * Kundenlinks: 256 Bit Zufall (base64url, 43 Zeichen). In der Datenbank wird
 * nur der SHA-256-Hash gespeichert; zusätzlich optional eine mit dem
 * Server-Schlüssel verschlüsselte Kopie, damit Erinnerungen den Link erneut
 * enthalten können.
 */
export function generateAccessToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function getKey(): Buffer | null {
  if (!serverEnv.encryptionKey) return null;
  const key = Buffer.from(serverEnv.encryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY muss 32 Byte (Base64-kodiert) lang sein. Erzeugen: npm run secrets:generate");
  }
  return key;
}

export function encryptionAvailable(): boolean {
  try {
    return getKey() !== null;
  } catch {
    return false;
  }
}

/** AES-256-GCM. Format: v1.<iv>.<tag>.<ciphertext> (base64url) */
export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key) throw new Error("APP_ENCRYPTION_KEY ist nicht gesetzt.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  if (!key) throw new Error("APP_ENCRYPTION_KEY ist nicht gesetzt.");
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unbekanntes Verschlüsselungsformat.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Optional verschlüsseln – ohne Schlüssel wird nichts gespeichert (Link dann nur einmalig sichtbar). */
export function encryptOptional(plain: string): string | null {
  return encryptionAvailable() ? encryptSecret(plain) : null;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
