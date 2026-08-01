import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { redactAccount } from "@/lib/sync/account-view";

/**
 * Update / disconnect one sync account (Gate C6). The collection route creates
 * and lists them; the sibling folders run the OAuth connect and the pulls.
 */
type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  return (
    await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, id)).limit(1)
  )[0];
}

// `status` is also allowed to be "error" in the table, but only a failed pull may
// set it (see the run route) — a client that could set it would be able to
// misreport the health of the integration.
const updateSchema = z
  .object({
    label: z.string().max(120).nullable(),
    status: z.enum(["active", "paused"]),
  })
  .partial();

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sync", "update");
    if (denied) return denied;
    const { id } = await params;
    if (!(await load(id))) return apiError("Account not found", 404);
    const body = await parseBody(req, updateSchema);
    if (!body.ok) return body.response;

    const patch: Partial<typeof tables.syncAccounts.$inferInsert> = {};
    if (body.data.label !== undefined) patch.label = body.data.label;
    if (body.data.status !== undefined) {
      patch.status = body.data.status;
      // Resuming an account clears the error left by the last failed pull, so the
      // UI does not keep showing a fault the operator has already dealt with.
      if (body.data.status === "active") patch.lastError = null;
    }

    if (Object.keys(patch).length > 0) {
      await db.update(tables.syncAccounts).set(patch).where(eq(tables.syncAccounts.id, id));
    }
    await audit(auth.user?.id, "sync_account.updated", {
      objectType: "sync_account",
      objectId: id,
      meta: { fields: Object.keys(patch) },
    });
    return json({ account: redactAccount((await load(id))!) });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sync", "delete");
    if (denied) return denied;
    const { id } = await params;
    const existing = await load(id);
    if (!existing) return apiError("Account not found", 404);

    // Ingested mail and events carry an account_id with no foreign key behind it
    // (the ingest tables are written, never read back), so nothing at the database
    // level would clear them. Their dedup index is keyed by account, which makes
    // them dead weight the moment the account goes — drop them here rather than
    // leave rows pointing at an id that no longer resolves. Contact timeline
    // activities are keyed to the contact, not the account, and are left alone.
    await db.delete(tables.emailMessages).where(eq(tables.emailMessages.accountId, id));
    await db.delete(tables.calendarEvents).where(eq(tables.calendarEvents.accountId, id));
    await db.delete(tables.syncAccounts).where(eq(tables.syncAccounts.id, id));

    await audit(auth.user?.id, "sync_account.deleted", {
      objectType: "sync_account",
      objectId: id,
      meta: { provider: existing.provider, email: existing.email },
    });
    return json({ ok: true });
  });
}
