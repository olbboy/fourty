import { and, eq, isNull } from "drizzle-orm";
import { db, tables, withWorkspace } from "@/db";
import { setPassword, sha256 } from "@/lib/auth";
import { newId, newToken } from "@/lib/id";
import { enqueue } from "@/lib/queue";
import { mailEnabled } from "@/lib/mail";
import { passwordResetEmail } from "@/lib/mail-templates";
import { log } from "@/lib/logger";

/**
 * Forgot-password over email.
 *
 * The self-serve counterpart to `npm run reset-password` (the admin's way in,
 * which needs server access). Exists only when outbound mail is configured —
 * without a transport there is nowhere to send the link, and the page says so
 * instead of accepting requests that can never arrive.
 *
 * Token treatment mirrors invites: the raw token lives in the emailed link and
 * nowhere else — the table keeps its sha256. Short TTL (1 hour, against the
 * invite's 7 days) because the token's only job is to be clicked shortly after
 * being requested, and every extra hour is time a compromised mailbox can use
 * it too. Single-use, and issuing a new token deletes the user's unused ones,
 * so exactly one link works at a time.
 */

export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// Queue jobs carry a workspace id for RLS-scoped idempotency receipts, but a
// password reset happens before sign-in — there is no workspace. This sentinel
// scopes the receipt instead; it cannot collide with a real id (newId() is
// always 16 chars) and job_receipts has no FK to enforce one.
const IDENTITY_SCOPE = "identity";

/**
 * Issue a reset token for `email` and queue the mail carrying it.
 *
 * Returns void deliberately: the caller must answer the same way whether or not
 * the address has an account, or the endpoint becomes an oracle for which
 * emails are registered. The no-user case logs at debug, not info, so a noisy
 * enumeration attempt does not flood the log with a signal either.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<void> {
  if (!mailEnabled()) return; // page already says resets are unavailable

  const normalized = email.toLowerCase().trim();
  const user = (
    await db
      .select({ id: tables.users.id, name: tables.users.name })
      .from(tables.users)
      .where(eq(tables.users.email, normalized))
      .limit(1)
  )[0];
  if (!user) {
    log().debug({ email: normalized }, "password reset requested for unknown address");
    return;
  }

  const token = newToken(24);
  const now = Date.now();
  await db.transaction(async (tx) => {
    // One live link at a time: a stack of outstanding tokens is a wider target
    // for a compromised mailbox and confuses the "which email do I click" case.
    await tx
      .delete(tables.passwordResets)
      .where(and(eq(tables.passwordResets.userId, user.id), isNull(tables.passwordResets.usedAt)));
    await tx.insert(tables.passwordResets).values({
      id: newId(),
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: now + RESET_TTL_MS,
      createdAt: now,
    });
  });

  const message = passwordResetEmail({
    name: user.name,
    resetUrl: `${origin}/reset?token=${encodeURIComponent(token)}`,
    expiresAt: now + RESET_TTL_MS,
  });
  // Wrapped in withWorkspace even though no tenant data is touched: in inline
  // queue mode the job runs right here, and its idempotency receipt lands in
  // the RLS-scoped job_receipts table, which needs an ambient workspace id. The
  // worker path does the same wrapping with the id it finds in the envelope.
  await withWorkspace(IDENTITY_SCOPE, () =>
    enqueue("mail.send", { to: normalized, ...message }, { workspaceId: IDENTITY_SCOPE }),
  );
}

/**
 * Redeem a token: set the new password, burn the token, kill the sessions.
 * Returns false for a token that is unknown, expired, or already used — the
 * caller shows one message for all three, since distinguishing them helps only
 * an attacker probing stolen links.
 */
export async function consumePasswordReset(token: string, password: string): Promise<boolean> {
  const tokenHash = sha256(token);
  const row = (
    await db
      .select()
      .from(tables.passwordResets)
      .where(and(eq(tables.passwordResets.tokenHash, tokenHash), isNull(tables.passwordResets.usedAt)))
      .limit(1)
  )[0];
  if (!row || row.expiresAt < Date.now()) return false;

  // Burn first, then set. Between the two a crash leaves a dead token and the
  // old password — annoying (request another link) but never a replayable one.
  const burned = await db
    .update(tables.passwordResets)
    .set({ usedAt: Date.now() })
    .where(and(eq(tables.passwordResets.id, row.id), isNull(tables.passwordResets.usedAt)))
    .returning({ id: tables.passwordResets.id });
  // Two concurrent redemptions race on usedAt; the returning clause makes the
  // update itself the arbiter, so exactly one wins.
  if (burned.length === 0) return false;

  await setPassword(row.userId, password);
  return true;
}
