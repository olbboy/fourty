import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for secrets Fourty has to keep usable — OAuth
 * refresh tokens above all (ADR-019).
 *
 * The threat this addresses is narrow and worth stating exactly: **a database
 * dump, a backup, or a read replica no longer hands over the mailboxes.** The
 * key lives in the environment, so it is not in the dump. It is *not* protection
 * against an attacker who already has the running process — they have the key
 * too, and they can simply ask the app to sync.
 *
 * That is also why the key may not be generated into the `settings` table the
 * way the webhook signing secret is: a key stored beside the ciphertext protects
 * against nothing, and would make this module a decoration.
 *
 * AES-256-GCM: the tag means tampering is detected rather than silently
 * decrypted into something else. The IV is random per call, so encrypting the
 * same token twice does not produce the same bytes.
 */

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Where the key comes from. Env only — never the database. */
export const SECRET_KEY_ENV = "FOURTY_SECRET_KEY";

export class SecretKeyError extends Error {}

/**
 * The configured key, or null when there is none.
 *
 * Accepts base64 or hex; both are what `openssl rand` prints. A key that is
 * present but the wrong length throws rather than being silently padded — a
 * short key that "works" is the worst outcome available here.
 */
export function secretKey(): Buffer | null {
  const raw = process.env[SECRET_KEY_ENV]?.trim();
  if (!raw) return null;
  const decoded = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (decoded.length !== KEY_BYTES) {
    throw new SecretKeyError(
      `${SECRET_KEY_ENV} must decode to ${KEY_BYTES} bytes (got ${decoded.length}). Generate one with: openssl rand -base64 32`,
    );
  }
  return decoded;
}

/** Whether this install can encrypt at all. */
export function encryptionEnabled(): boolean {
  return secretKey() !== null;
}

/** Does this value carry our envelope? Anything else is legacy plaintext. */
export function isSealed(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * Encrypt a secret. Throws when no key is configured — callers decide whether
 * that is a refusal or a reason to store plaintext, and they should not be able
 * to make that choice by accident.
 */
export function seal(plain: string): string {
  const key = secretKey();
  if (!key) throw new SecretKeyError(`${SECRET_KEY_ENV} is not set, so this secret cannot be encrypted.`);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

/**
 * Decrypt a value produced by `seal`.
 *
 * A value with no envelope is returned unchanged: rows written before this
 * existed hold plaintext, and an install that upgrades must keep syncing. Those
 * rows are re-sealed the next time anything writes them.
 */
export function open(value: string): string {
  if (!isSealed(value)) return value;
  const key = secretKey();
  if (!key) {
    throw new SecretKeyError(
      `${SECRET_KEY_ENV} is not set, but this value was encrypted with it. Restore the key to read it.`,
    );
  }
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  // Throws on a bad tag — a tampered or wrong-key value fails loudly.
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
