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

/**
 * Keys that are being rotated out. Comma-separated, read-only: nothing is ever
 * encrypted with one again, but everything sealed under one stays readable
 * until `npm run rekey` has rewritten it.
 *
 * This is what makes rotation a zero-downtime operation rather than a window in
 * which half the mailboxes are unreadable.
 */
export const RETIRED_KEYS_ENV = "FOURTY_SECRET_KEY_OLD";

export class SecretKeyError extends Error {}

/** Base64 or hex — both are what `openssl rand` prints. */
function parseKey(raw: string, envName: string): Buffer {
  const decoded = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (decoded.length !== KEY_BYTES) {
    throw new SecretKeyError(
      `${envName} must decode to ${KEY_BYTES} bytes (got ${decoded.length}). Generate one with: openssl rand -base64 32`,
    );
  }
  return decoded;
}

/**
 * The key everything is encrypted *with*, or null when there is none.
 *
 * A key that is present but the wrong length throws rather than being silently
 * padded — a short key that "works" is the worst outcome available here.
 */
export function secretKey(): Buffer | null {
  const raw = process.env[SECRET_KEY_ENV]?.trim();
  return raw ? parseKey(raw, SECRET_KEY_ENV) : null;
}

/** Keys kept only so old ciphertext stays readable during a rotation. */
export function retiredKeys(): Buffer[] {
  const raw = process.env[RETIRED_KEYS_ENV]?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => parseKey(k, RETIRED_KEYS_ENV));
}

/** Every key a value might have been sealed under, current one first. */
function decryptionKeys(): Buffer[] {
  const primary = secretKey();
  return [...(primary ? [primary] : []), ...retiredKeys()];
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

/** One attempt. Returns null when this key is not the one — GCM says so. */
function tryOpen(value: string, key: Buffer): string | null {
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = raw.subarray(IV_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    // A bad tag. Either the wrong key or a tampered value; the caller decides
    // which by whether any other key works.
    return null;
  }
}

/**
 * Decrypt a value produced by `seal`.
 *
 * A value with no envelope is returned unchanged: rows written before this
 * existed hold plaintext, and an install that upgrades must keep syncing. Those
 * rows are re-sealed the next time anything writes them.
 *
 * **Every configured key is tried, current one first.** The envelope carries no
 * key id, and it does not need one: GCM authenticates, so a key that is not the
 * one fails its tag rather than returning plausible garbage. Trial decryption
 * over two or three keys is what makes a rotation a rolling operation instead
 * of a flag day, and it costs nothing worth measuring.
 */
export function open(value: string): string {
  if (!isSealed(value)) return value;
  const keys = decryptionKeys();
  if (keys.length === 0) {
    throw new SecretKeyError(
      `${SECRET_KEY_ENV} is not set, but this value was encrypted with it. Restore the key to read it.`,
    );
  }
  for (const key of keys) {
    const plain = tryOpen(value, key);
    if (plain !== null) return plain;
  }
  throw new SecretKeyError(
    `No configured key decrypts this value. If it was sealed with a previous key, list that key in ${RETIRED_KEYS_ENV} and run \`npm run rekey\`.`,
  );
}

/**
 * Is this value already sealed under the key we encrypt with today?
 *
 * The question `npm run rekey` asks of every row, so it rewrites the ones that
 * need it and leaves the rest alone. Plaintext answers false — re-keying is
 * also how a first-time key gets applied to rows that predate it.
 */
export function sealedWithCurrentKey(value: string): boolean {
  if (!isSealed(value)) return false;
  const key = secretKey();
  return key !== null && tryOpen(value, key) !== null;
}
