import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ingestEmails, ingestCalendar } from "@/lib/sync/ingest";

type Params = { params: Promise<{ id: string }> };

/**
 * Push raw content into an account's mailbox/calendar (Gate C6). This is the
 * provider-agnostic ingestion surface: a mail webhook, the sync worker, or an
 * IMAP poller hands raw RFC822 messages and/or an ICS blob here, and the engine
 * parses → matches to a contact → dedupes → stores + logs an activity. Idempotent
 * (dedup by Message-ID / UID), so redelivery is safe.
 */
const input = z.object({
  messages: z.array(z.string().max(1_000_000)).max(500).optional(),
  calendar: z.string().max(2_000_000).optional(),
});

export async function POST(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sync", "update");
    if (denied) return denied;
    const { id } = await params;
    const account = (
      await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, id)).limit(1)
    )[0];
    if (!account) return apiError("Account not found", 404);
    const body = await parseBody(req, input);
    if (!body.ok) return body.response;

    const emails = body.data.messages?.length
      ? await ingestEmails(id, body.data.messages)
      : { ingested: 0, linked: 0, duplicates: 0 };
    const calendar = body.data.calendar
      ? await ingestCalendar(id, body.data.calendar)
      : { ingested: 0, linked: 0, duplicates: 0 };

    await db
      .update(tables.syncAccounts)
      .set({ lastSyncedAt: Date.now(), status: "active", lastError: null })
      .where(eq(tables.syncAccounts.id, id));
    await audit(auth.user?.id, "sync_account.ingested", {
      objectType: "sync_account",
      objectId: id,
      meta: { emails, calendar },
    });
    return json({ emails, calendar });
  });
}
