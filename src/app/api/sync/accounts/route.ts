import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { audit } from "@/lib/audit";

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

/** Strip secret-bearing config keys from an account before returning it. */
function redact(row: typeof tables.syncAccounts.$inferSelect) {
  const cfg = JSON.parse(row.config) as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  // Only surface non-secret hints (e.g. the ICS URL host, IMAP host) — never creds
  // or OAuth tokens. `connected` tells the UI a refresh token is present.
  if (typeof cfg.host === "string") safe.host = cfg.host;
  if (typeof cfg.url === "string") safe.url = cfg.url;
  const { config: _c, ...rest } = row;
  return { ...rest, config: safe, connected: typeof cfg.refreshToken === "string" };
}

export async function GET(req: Request) {
  return withAuth(req, async () => {
    const rows = await db
      .select()
      .from(tables.syncAccounts)
      .orderBy(desc(tables.syncAccounts.createdAt));
    return json({ accounts: rows.map(redact) });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sync", "create");
    if (denied) return denied;
    const body = await parseBody(req, input);
    if (!body.ok) return body.response;
    const id = newId();
    await db.insert(tables.syncAccounts).values({
      id,
      provider: body.data.provider,
      email: body.data.email,
      label: body.data.label ?? null,
      config: JSON.stringify(body.data.config),
      createdAt: Date.now(),
    });
    await audit(auth.user?.id, "sync_account.connected", { objectType: "sync_account", objectId: id });
    const row = (
      await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, id)).limit(1)
    )[0]!;
    return json({ account: redact(row) }, { status: 201 });
  });
}
