import { eq } from "drizzle-orm";
import { db, tables, withWorkspace } from "@/db";
import { checkWebhookUrl } from "@/lib/net";
import { ingestCalendar, ingestEmails, type IngestResult } from "./ingest";
import { peekAccountConfig } from "./account-config";
import { accessTokenFor, fetchMail } from "./transport";

/**
 * Pull one connected account (ADR-009). Extracted from the "Sync now" route so
 * the scheduled `mailbox.pull` task and the button do the same thing — a second
 * copy of this would drift, and the background copy is the one nobody watches.
 *
 * **This function owns its transactions, and never holds one across the
 * network.** It used to run entirely inside the caller's `withWorkspace()`,
 * which meant a Postgres connection sat idle for the whole Gmail round-trip;
 * Phase 2 recorded that as debt and Phase 3 is what makes the volume matter. The
 * shape is now: short transaction to read the account, network with nothing
 * open, short transaction to persist a refreshed token, network to fetch, short
 * transaction to ingest and mark.
 *
 * So callers pass a `workspaceId` and do **not** wrap the call.
 */

export type PullResult =
  | { ok: true; emails?: IngestResult; calendar?: IngestResult }
  | { ok: false; status: number; reason: string };

type SyncAccount = typeof tables.syncAccounts.$inferSelect;

/** Which accounts Fourty can go and fetch itself; IMAP is push-only. */
export function canPull(account: SyncAccount): boolean {
  const cfg = peekAccountConfig(account.config);
  if (account.provider === "ics") return typeof cfg.url === "string";
  if (account.provider === "google" || account.provider === "microsoft") {
    return typeof cfg.refreshToken === "string";
  }
  return false;
}

export async function pullAccount(workspaceId: string, accountId: string): Promise<PullResult> {
  const account = await withWorkspace(workspaceId, () => loadAccount(accountId));
  if (!account) return { ok: false, status: 404, reason: "Account not found" };

  if (account.provider === "google" || account.provider === "microsoft") {
    return pullMail(workspaceId, account);
  }

  const cfg = peekAccountConfig(account.config);
  if (account.provider !== "ics" || typeof cfg.url !== "string") {
    return {
      ok: false,
      status: 400,
      reason: `Live run not supported for provider '${account.provider}' without a feed URL`,
    };
  }
  return pullFeed(workspaceId, accountId, cfg.url);
}

async function pullMail(workspaceId: string, account: SyncAccount): Promise<PullResult> {
  let raws: string[];
  try {
    // No transaction is open here — a token refresh and a mailbox fetch are
    // provider round-trips, and the connection belongs back in the pool.
    const { token, config } = await accessTokenFor(account);
    // Persisted before the fetch: a refresh that succeeded and was then thrown
    // away because the fetch failed means refreshing again on every pull.
    if (config) await withWorkspace(workspaceId, () => persistConfig(account.id, config));
    raws = await fetchMail(account, token, { limit: 50 });
  } catch (err) {
    const reason = message(err, "sync failed");
    await withWorkspace(workspaceId, () => markFailed(account.id, reason));
    return { ok: false, status: 502, reason: `Mail sync failed: ${reason}` };
  }

  return withWorkspace(workspaceId, async () => {
    const emails = await ingestEmails(account.id, raws);
    await markSynced(account.id);
    return { ok: true, emails };
  });
}

async function pullFeed(workspaceId: string, accountId: string, url: string): Promise<PullResult> {
  // The feed URL is user-supplied, so the SSRF guard runs before the fetch.
  const check = await checkWebhookUrl(url);
  if (!check.ok) return { ok: false, status: 400, reason: `Refusing to fetch feed: ${check.reason}` };

  let ics: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`feed responded ${res.status}`);
    ics = await res.text();
  } catch (err) {
    const reason = message(err, "fetch failed");
    await withWorkspace(workspaceId, () => markFailed(accountId, reason));
    return { ok: false, status: 502, reason: `Feed fetch failed: ${reason}` };
  }

  return withWorkspace(workspaceId, async () => {
    const calendar = await ingestCalendar(accountId, ics);
    await markSynced(accountId);
    return { ok: true, calendar };
  });
}

async function loadAccount(accountId: string): Promise<SyncAccount | null> {
  const [account] = await db
    .select()
    .from(tables.syncAccounts)
    .where(eq(tables.syncAccounts.id, accountId))
    .limit(1);
  return account ?? null;
}

async function persistConfig(accountId: string, config: string): Promise<void> {
  await db
    .update(tables.syncAccounts)
    .set({ config })
    .where(eq(tables.syncAccounts.id, accountId));
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

const message = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback;
