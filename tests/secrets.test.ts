import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSealed, open, seal, secretKey, SecretKeyError, SECRET_KEY_ENV } from "@/lib/crypto/secrets";
import {
  hasSealedSecrets,
  peekAccountConfig,
  readAccountConfig,
  writeAccountConfig,
} from "@/lib/sync/account-config";

/**
 * Encryption of the credentials in `sync_accounts.config` (ADR-019).
 *
 * The claim being defended is narrow: a database dump no longer hands over the
 * mailboxes. So the assertions that matter are that the ciphertext does not
 * contain the token, that a tampered value fails loudly rather than decrypting
 * into something else, and that an install which upgrades keeps working on the
 * plaintext it already had.
 */

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");
// Deliberately not shaped like a real Google refresh token (`1//0g…`):
// secret scanners match on that prefix, and the crypto does not care.
const TOKEN = "refresh-token-fixture-not-a-real-credential";

const original = process.env[SECRET_KEY_ENV];
beforeEach(() => {
  process.env[SECRET_KEY_ENV] = KEY;
});
afterEach(() => {
  if (original === undefined) delete process.env[SECRET_KEY_ENV];
  else process.env[SECRET_KEY_ENV] = original;
});

describe("sealing a secret", () => {
  it("round-trips", () => {
    expect(open(seal(TOKEN))).toBe(TOKEN);
  });

  it("does not leave the plaintext in the envelope", () => {
    const sealed = seal(TOKEN);
    expect(sealed).not.toContain(TOKEN);
    expect(sealed).not.toContain("fixture");
    expect(isSealed(sealed)).toBe(true);
  });

  it("produces different bytes each time, so equal tokens are not equal rows", () => {
    expect(seal(TOKEN)).not.toBe(seal(TOKEN));
  });

  it("refuses a tampered value rather than decrypting it", () => {
    const sealed = seal(TOKEN);
    // Flip the last body byte; the GCM tag must catch it.
    const body = Buffer.from(sealed.slice("enc:v1:".length), "base64");
    body[body.length - 1] ^= 0xff;
    expect(() => open("enc:v1:" + body.toString("base64"))).toThrow();
  });

  it("refuses the wrong key", () => {
    const sealed = seal(TOKEN);
    process.env[SECRET_KEY_ENV] = OTHER_KEY;
    expect(() => open(sealed)).toThrow();
  });

  it("says so when the key is the wrong length instead of padding it", () => {
    process.env[SECRET_KEY_ENV] = Buffer.alloc(16, 1).toString("base64");
    expect(() => secretKey()).toThrow(SecretKeyError);
  });

  it("accepts a hex key as well as base64 — both are what openssl prints", () => {
    process.env[SECRET_KEY_ENV] = Buffer.alloc(32, 3).toString("hex");
    expect(open(seal(TOKEN))).toBe(TOKEN);
  });
});

describe("the account config boundary", () => {
  it("encrypts credentials and leaves operational fields readable", () => {
    const raw = writeAccountConfig({ refreshToken: TOKEN, url: "https://cal.example/f.ics", host: "imap.example" });
    const stored = JSON.parse(raw) as Record<string, string>;

    expect(raw).not.toContain(TOKEN);
    expect(isSealed(stored.refreshToken)).toBe(true);
    // An operator reading the row can still see which mailbox this is.
    expect(stored.url).toBe("https://cal.example/f.ics");
    expect(stored.host).toBe("imap.example");

    expect(readAccountConfig(raw).refreshToken).toBe(TOKEN);
  });

  it("answers presence questions without the key", () => {
    const raw = writeAccountConfig({ refreshToken: TOKEN, url: "https://cal.example/f.ics" });
    delete process.env[SECRET_KEY_ENV];
    // `canPull` and the settings list ask only "is a token on file" — they must
    // keep working on an install whose key is missing, which is exactly when
    // someone needs the settings page.
    const cfg = peekAccountConfig(raw);
    expect(typeof cfg.refreshToken).toBe("string");
    expect(cfg.url).toBe("https://cal.example/f.ics");
  });

  it("refuses to store a new credential with no key configured", () => {
    delete process.env[SECRET_KEY_ENV];
    expect(() => writeAccountConfig({ refreshToken: TOKEN })).toThrow(SecretKeyError);
    expect(() => writeAccountConfig({ refreshToken: TOKEN })).toThrow(/openssl rand/);
  });

  /**
   * The rule that stops "fail closed" from becoming an outage. A mailbox
   * connected before this feature existed refreshes its access token roughly
   * hourly; refusing that write would stop it syncing an hour after an upgrade,
   * which is not a security improvement — the plaintext is already in the row.
   */
  it("lets an account that was already plaintext refresh, and says so", () => {
    delete process.env[SECRET_KEY_ENV];
    const legacyRow = JSON.stringify({ refreshToken: TOKEN, expiresAt: 1 });
    const next = writeAccountConfig({ refreshToken: "rotated-token", expiresAt: 2 }, legacyRow);
    expect(JSON.parse(next).refreshToken).toBe("rotated-token");
  });

  it("still refuses when the previous row had no credential to begin with", () => {
    delete process.env[SECRET_KEY_ENV];
    // Connecting a mailbox to an account that only held an ICS URL is a *new*
    // secret, whatever else is in the row.
    const previous = JSON.stringify({ url: "https://cal.example/f.ics" });
    expect(() => writeAccountConfig({ refreshToken: TOKEN }, previous)).toThrow(SecretKeyError);
  });

  it("still refuses when the previous credential was sealed", () => {
    const sealedRow = writeAccountConfig({ refreshToken: TOKEN });
    delete process.env[SECRET_KEY_ENV];
    // Losing the key is not permission to downgrade to plaintext.
    expect(() => writeAccountConfig({ refreshToken: "rotated" }, sealedRow)).toThrow(SecretKeyError);
  });

  it("still writes a config that holds no credentials at all", () => {
    delete process.env[SECRET_KEY_ENV];
    // An ICS feed needs no secret, so it connects on an install with no key.
    expect(JSON.parse(writeAccountConfig({ url: "https://cal.example/f.ics" }))).toEqual({
      url: "https://cal.example/f.ics",
    });
  });

  it("reads a legacy plaintext row unchanged, so an upgrade keeps syncing", () => {
    const legacy = JSON.stringify({ refreshToken: TOKEN, expiresAt: 123 });
    expect(hasSealedSecrets(legacy)).toBe(false);
    expect(readAccountConfig(legacy).refreshToken).toBe(TOKEN);
  });

  it("upgrades that row the next time anything writes it", () => {
    const legacy = readAccountConfig(JSON.stringify({ refreshToken: TOKEN }));
    const rewritten = writeAccountConfig(legacy);
    expect(hasSealedSecrets(rewritten)).toBe(true);
    expect(readAccountConfig(rewritten).refreshToken).toBe(TOKEN);
  });

  it("does not double-wrap an already-sealed value", () => {
    const once = writeAccountConfig({ refreshToken: TOKEN });
    const twice = writeAccountConfig(peekAccountConfig(once));
    expect(readAccountConfig(twice).refreshToken).toBe(TOKEN);
  });

  it("explains itself when the key is gone but the data is sealed", () => {
    const raw = writeAccountConfig({ refreshToken: TOKEN });
    delete process.env[SECRET_KEY_ENV];
    expect(() => readAccountConfig(raw)).toThrow(/FOURTY_SECRET_KEY/);
  });
});
