import crypto from "node:crypto";
import { config } from "./config";

/**
 * AES-256-GCM vault for provider API keys and user connector secrets.
 * Format: v1:<iv-b64>:<tag-b64>:<cipher-b64>
 */

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", config.vaultKey, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string | null {
  try {
    const [v, ivB, tagB, dataB] = stored.split(":");
    if (v !== "v1" || !ivB || !tagB || !dataB) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", config.vaultKey, Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

/** Mask a secret for safe display: show at most last 4 chars. */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  if (plain.length <= 4) return "••••";
  return `••••••••${plain.slice(-4)}`;
}

export function sha256Hex(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------
// Password hashing (scrypt, N=16384, r=8, p=1) — production grade
// ---------------------------------------------------------------

const SCRYPT_OPTS: crypto.ScryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_OPTS);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  try {
    const [scheme, saltB, hashB] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB, "base64");
    const expected = Buffer.from(hashB, "base64");
    const actual = crypto.scryptSync(password, salt, expected.length, SCRYPT_OPTS);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return String(crypto.randomInt(0, max)).padStart(digits, "0");
}
