import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { audit } from "@/lib/audit";
import { redactAccount } from "@/lib/sync/account-view";
import { writeAccountConfig } from "@/lib/sync/account-config";
import { SecretKeyError } from "@/lib/crypto/secrets";

/**
 * Sync accounts (Gate C6): connect a mailbox/calendar. The `config` blob holds
 * provider connection details (IMAP host/creds, OAuth token ref, or an ICS feed
 * URL). Secrets in config are never returned by GET.
 */
const input = z.object({
  provider: z.enum(["imap", "google", "microsoft", "ics"]),
  email: z.string().email(),
  label: z.string().max(120).nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function GET(req: Request) {
  return withAuth(req, async () => {
    const rows = await db
      .select()
      .from(tables.syncAccounts)
      .orderBy(desc(tables.syncAccounts.createdAt));
    return json({ accounts: rows.map(redactAccount) });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sync", "create");
    if (denied) return denied;
    const body = await parseBody(req, input);
    if (!body.ok) return body.response;

    // With no encryption key configured, a config carrying credentials is
    // refused outright — that is a misconfigured server, not a bad request, but
    // the caller is the one who can read the remedy.
    let config: string;
    try {
      config = writeAccountConfig(body.data.config);
    } catch (err) {
      if (err instanceof SecretKeyError) return apiError(err.message, 400);
      throw err;
    }

    const id = newId();
    await db.insert(tables.syncAccounts).values({
      id,
      provider: body.data.provider,
      email: body.data.email,
      label: body.data.label ?? null,
      config,
      createdAt: Date.now(),
    });
    await audit(auth.user?.id, "sync_account.connected", { objectType: "sync_account", objectId: id });
    const row = (
      await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, id)).limit(1)
    )[0]!;
    return json({ account: redactAccount(row) }, { status: 201 });
  });
}
