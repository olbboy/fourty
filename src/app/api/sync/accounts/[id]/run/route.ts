import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { checkWebhookUrl } from "@/lib/net";
import { ingestCalendar } from "@/lib/sync/ingest";

type Params = { params: Promise<{ id: string }> };

/**
 * Trigger a live pull for an account (Gate C6). Implemented for the `ics` provider:
 * fetch the feed URL (SSRF-guarded via checkWebhookUrl) and run it through the same
 * ingest engine as the push endpoint. IMAP/Gmail/Microsoft transports are the
 * injectable edge — their OAuth/IMAP fetch plugs in here and then calls
 * ingestEmails(); those network transports are not exercised by the test suite.
 */
export async function POST(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sync", "update");
    if (denied) return denied;
    const { id } = await params;
    const account = (
      await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, id)).limit(1)
    )[0];
    if (!account) return apiError("Account not found", 404);

    const cfg = JSON.parse(account.config) as { url?: string };
    if (account.provider !== "ics" || !cfg.url) {
      return apiError(`Live run not supported for provider '${account.provider}' without a feed URL`, 400);
    }
    const check = await checkWebhookUrl(cfg.url);
    if (!check.ok) return apiError(`Refusing to fetch feed: ${check.reason}`, 400);

    let ics: string;
    try {
      const res = await fetch(cfg.url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`feed responded ${res.status}`);
      ics = await res.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch failed";
      await db
        .update(tables.syncAccounts)
        .set({ status: "error", lastError: message })
        .where(eq(tables.syncAccounts.id, id));
      return apiError(`Feed fetch failed: ${message}`, 502);
    }

    const calendar = await ingestCalendar(id, ics);
    await db
      .update(tables.syncAccounts)
      .set({ lastSyncedAt: Date.now(), status: "active", lastError: null })
      .where(eq(tables.syncAccounts.id, id));
    await audit(auth.user?.id, "sync_account.ran", { objectType: "sync_account", objectId: id, meta: { calendar } });
    return json({ calendar });
  });
}
