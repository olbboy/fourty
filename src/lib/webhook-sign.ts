import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";

/**
 * Webhook HMAC signing (Gate D3, ADR-013). Each workspace has a signing secret;
 * every outbound webhook is signed `sha256=HMAC(secret, "<timestamp>.<body>")`
 * and carries the timestamp, so a receiver can verify authenticity and reject
 * replays. Mirrors the Stripe/GitHub signing convention.
 */
export const SIGNATURE_HEADER = "X-Fourty-Signature";
export const TIMESTAMP_HEADER = "X-Fourty-Timestamp";
const SECRET_KEY = "webhook_signing_secret";

/** Hex HMAC-SHA256 of `${timestamp}.${body}` under `secret`. */
export function sign(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Signature + timestamp headers for an outbound payload. */
export function signatureHeaders(secret: string, body: string, now = Date.now()): Record<string, string> {
  return {
    [SIGNATURE_HEADER]: `sha256=${sign(secret, now, body)}`,
    [TIMESTAMP_HEADER]: String(now),
  };
}

/**
 * Verify a received webhook signature (for consumers / tests). Timing-safe, and
 * rejects timestamps outside `toleranceMs` (default 5 min) to block replays.
 */
export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  body: string,
  toleranceMs = 5 * 60 * 1000,
  now = Date.now(),
): boolean {
  if (!signatureHeader || !timestampHeader) return false;
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > toleranceMs) return false;
  const provided = signatureHeader.replace(/^sha256=/, "");
  const expected = sign(secret, ts, body);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * The active workspace's signing secret, created on first use. Must run inside
 * withWorkspace() (settings is RLS-scoped). Idempotent under a race via
 * ON CONFLICT DO NOTHING + re-read.
 */
export async function getOrCreateSigningSecret(): Promise<string> {
  const read = async () =>
    (await db.select().from(tables.settings).where(eq(tables.settings.key, SECRET_KEY)).limit(1))[0]?.value;
  const existing = await read();
  if (existing) return existing;
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  await db.insert(tables.settings).values({ key: SECRET_KEY, value: secret }).onConflictDoNothing();
  return (await read()) ?? secret;
}

/** Rotate (replace) the workspace's signing secret. Returns the new value. */
export async function rotateSigningSecret(): Promise<string> {
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const updated = await db
    .update(tables.settings)
    .set({ value: secret })
    .where(eq(tables.settings.key, SECRET_KEY))
    .returning({ key: tables.settings.key });
  if (updated.length === 0) {
    await db.insert(tables.settings).values({ key: SECRET_KEY, value: secret }).onConflictDoNothing();
  }
  return secret;
}
