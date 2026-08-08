import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { checkWebhookUrl } from "@/lib/net";
import { ingestCalendar, type IngestResult } from "./ingest";
import { runMailSync } from "./transport";

/**
 * Pull one connected account (ADR-009). Extracted from the "Sync now" route so
 * the scheduled `mailbox.pull` task and the button do the same thing — a second
 * copy of this would drift, and the background copy is the one nobody watches.
 *
 * Runs inside the caller's `withWorkspace()` transaction. Provider network calls
 * go through the injectable edge (`src/lib/sync/http.ts`); the ICS fetch is
 * SSRF-guarded because the feed URL is user-supplied.
 */

export type PullResult =
  | { ok: true; emails?: IngestResult; calendar?: IngestResult }
  | { ok: false; status: number; reason: string };

/** Which accounts Fourty can go and fetch itself; IMAP is push-only. */
export function canPull(account: typeof tables.syncAccounts.$inferSelect): boolean {
  const cfg = safeConfig(account.config);
  if (account.provider === "ics") return typeof cfg.url === "string";
  if (account.provider === "google" || account.provider === "microsoft") {
    return typeof cfg.refreshToken === "string";
  }
  return false;
}

export async function pullAccount(accountId: string): Promise<PullResult> {
  const [account] = await db
    .select()
    .from(tables.syncAccounts)
    .where(eq(tables.syncAccounts.id, accountId))
    .limit(1);
  if (!account) return { ok: false, status: 404, reason: "Account not found" };

  if (account.provider === "google" || account.provider === "microsoft") {
    try {
      const emails = await runMailSync(account, { limit: 50 });
      await markSynced(accountId);
      return { ok: true, emails };
    } catch (err) {
      const reason = message(err, "sync failed");
      await markFailed(accountId, reason);
      return { ok: false, status: 502, reason: `Mail sync failed: ${reason}` };
    }
  }

  const cfg = safeConfig(account.config);
  if (account.provider !== "ics" || typeof cfg.url !== "string") {
    return {
      ok: false,
      status: 400,
      reason: `Live run not supported for provider '${account.provider}' without a feed URL`,
    };
  }

  const check = await checkWebhookUrl(cfg.url);
  if (!check.ok) return { ok: false, status: 400, reason: `Refusing to fetch feed: ${check.reason}` };

  let ics: string;
  try {
    const res = await fetch(cfg.url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`feed responded ${res.status}`);
    ics = await res.text();
  } catch (err) {
    const reason = message(err, "fetch failed");
    await markFailed(accountId, reason);
    return { ok: false, status: 502, reason: `Feed fetch failed: ${reason}` };
  }

  const calendar = await ingestCalendar(accountId, ics);
  await markSynced(accountId);
  return { ok: true, calendar };
}

/**
 * A failure is written to the account, not only to a log: an expired OAuth
 * refresh token has to be visible in Settings → Mailboxes, or the mailbox
 * quietly stops feeding everything downstream of it.
 */
async function markFailed(accountId: string, reason: string): Promise<void> {
  await db
    .update(tables.syncAccounts)
    .set({ status: "error", lastError: reason })
    .where(eq(tables.syncAccounts.id, accountId));
}

async function markSynced(accountId: string): Promise<void> {
  await db
    .update(tables.syncAccounts)
    .set({ lastSyncedAt: Date.now(), status: "active", lastError: null })
    .where(eq(tables.syncAccounts.id, accountId));
}

function safeConfig(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const message = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback;
