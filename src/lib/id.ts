import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** URL-safe unique id, 16 chars — compact and collision-safe for CRM scale. */
export function newId(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
