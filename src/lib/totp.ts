import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) + Base32 (RFC 4648) — dependency-free 2FA primitives (Gate D2).
 * SHA-1, 6 digits, 30-second step (the defaults every authenticator app expects).
 * Verified against the RFC 6238 test vector in tests/totp.test.ts.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random Base32 TOTP secret (20 bytes = 160 bits, per RFC 4226). */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The TOTP code for a Base32 secret at a given Unix time (seconds). */
export function totp(secret: string, unixSeconds: number, step = 30, digits = 6): string {
  const counter = Math.floor(unixSeconds / step);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter (high word is 0 until year ~4700).
  buf.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

/**
 * Verify a submitted token against a secret, allowing ±`window` steps for clock
 * skew. `now` defaults to the current time; pass it in for deterministic tests.
 */
export function verifyTotp(secret: string, token: string, window = 1, now = Date.now()): boolean {
  const cleaned = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const unix = Math.floor(now / 1000);
  for (let w = -window; w <= window; w++) {
    const candidate = totp(secret, unix + w * 30);
    if (candidate.length === cleaned.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(cleaned))) {
      return true;
    }
  }
  return false;
}

/** One-time recovery codes (plaintext — hash before storing, show once). */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex"); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

/** otpauth:// URI for QR provisioning in an authenticator app. */
export function otpauthUri(secret: string, account: string, issuer = "Fourty"): string {
  // Keep the issuer:account colon literal (the otpauth label separator); encode
  // each part so an "@" in the account becomes %40 but the ":" stays.
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}
