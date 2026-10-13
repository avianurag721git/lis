import crypto from "crypto";
import { env } from "../../config/env";

/**
 * HIPAA field-level encryption (AES-256-GCM).
 * Payload format: base64(iv[12] || tag[16] || ciphertext)
 */
const deriveKey = (): Buffer => crypto.createHash("sha256").update(env.phiEncryptionKey).digest();

export const aesGcmEncrypt = (plaintext: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
};

export const aesGcmDecrypt = (payloadB64: string): string => {
  const payload = Buffer.from(payloadB64, "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};

/** Deterministic HMAC for equality lookups without storing plaintext. */
export const hashIdentifier = (value: string): string =>
  crypto.createHmac("sha256", env.phiEncryptionKey).update(value.trim().toUpperCase()).digest("hex");

export const maskNationalId = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const v = value.replace(/\s/g, "");
  if (v.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`;
};
