import { log } from "@/lib/logger";
import { isSealed, open, seal, secretKey, SecretKeyError, SECRET_KEY_ENV } from "@/lib/crypto/secrets";

/**
 * The one place that knows which parts of `sync_accounts.config` are secret.
 *
 * The column is a JSON blob of provider connection details. Some of it is
 * operational (an ICS feed URL, an IMAP host) and is shown in Settings; some of
 * it is credentials. Only the credentials are encrypted, so an operator can
 * still read a row and see *which* mailbox is misbehaving without holding the
 * key.
 *
 * **Known non-goal:** the ICS feed URL is not sealed. Some calendar providers
 * put a token in that URL, so this is a real gap — but the URL is deliberately
 * surfaced to the settings UI, and sealing it is a separate change with its own
 * UI consequences rather than something to slip in here.
 */

export type AccountConfig = Record<string, unknown>;

/** Closed list. A field not named here is stored as-is, in the clear. */
export const SEALED_FIELDS = ["accessToken", "refreshToken", "password", "clientSecret"] as const;

/**
 * Parse a config blob **without** decrypting anything, and without throwing.
 *
 * For the questions that do not need the secret itself: *is a refresh token on
 * file?*, *what is the feed URL?* A sealed value is still a string, so presence
 * checks work unchanged — and listing mailboxes keeps working on an install
 * whose key is missing, which is exactly when someone needs the settings page.
 */
export function peekAccountConfig(raw: string): AccountConfig {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as AccountConfig) : {};
  } catch {
    return {};
  }
}

/**
 * Parse a config blob and decrypt its credentials, ready to use.
 *
 * Throws when a value is sealed and the key is gone. That is the correct,
 * visible failure: the alternative is a sync that fails later with a confusing
 * provider error instead of "the key that reads this is missing".
 */
export function readAccountConfig(raw: string): AccountConfig {
  const cfg = peekAccountConfig(raw);
  for (const field of SEALED_FIELDS) {
    const value = cfg[field];
    if (typeof value === "string" && isSealed(value)) cfg[field] = open(value);
  }
  return cfg;
}

/**
 * Serialize a config blob, encrypting its credentials.
 *
 * **Fail closed on new secrets; never make an existing install worse.** With no
 * key configured:
 *
 * - a *new* credential is refused rather than written in the clear;
 * - a credential replacing one that was already stored in the clear is written
 *   in the clear, because that account predates this feature and refusing would
 *   stop it syncing the moment its access token expired — a silent outage an
 *   hour after an upgrade, which is not a security improvement.
 *
 * Pass `previousRaw` (the config currently in the row) so the two can be told
 * apart. Omit it and every credential is treated as new, which is the safe
 * default for a caller that does not know.
 *
 * A config with no credentials in it — an ICS feed, say — writes normally
 * either way.
 */
export function writeAccountConfig(cfg: AccountConfig, previousRaw?: string): string {
  const out: AccountConfig = { ...cfg };
  const secrets = SEALED_FIELDS.filter((f) => typeof out[f] === "string" && (out[f] as string) !== "");

  if (secrets.length > 0 && secretKey() === null) {
    const previous = previousRaw ? peekAccountConfig(previousRaw) : {};
    const wasAlreadyPlaintext = secrets.some(
      (f) => typeof previous[f] === "string" && !isSealed(previous[f] as string),
    );
    if (!wasAlreadyPlaintext) {
      throw new SecretKeyError(
        `Refusing to store ${secrets.join(", ")} unencrypted. Set ${SECRET_KEY_ENV} (openssl rand -base64 32) and try again.`,
      );
    }
    log().warn(
      { fields: secrets },
      `${SECRET_KEY_ENV} is not set — refreshing credentials that were already stored in the clear. Set the key to encrypt them.`,
    );
    return JSON.stringify(out);
  }

  for (const field of secrets) {
    const value = out[field] as string;
    // Re-sealing an already-sealed value would double-wrap it. This also means a
    // legacy plaintext row is upgraded the first time anything writes it.
    out[field] = isSealed(value) ? value : seal(value);
  }
  return JSON.stringify(out);
}

/** True when this config holds anything the key is needed for. */
export function hasSealedSecrets(raw: string): boolean {
  const cfg = peekAccountConfig(raw);
  return SEALED_FIELDS.some((f) => typeof cfg[f] === "string" && isSealed(cfg[f] as string));
}
