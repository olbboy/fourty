import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { eq } from "drizzle-orm";
import { createWorkspace, resetDb } from "./pg-setup";
import { pullAccount } from "@/lib/sync/pull";

/**
 * `pullAccount` against real Postgres (Phase 3).
 *
 * The thing under test is the transaction shape. `pullAccount` used to run
 * inside the caller's `withWorkspace()`, which held a connection open for the
 * whole provider round-trip; it now opens its own short transactions around the
 * network instead. So it is called here with **no transaction wrapper at all**,
 * which is how the dispatcher and the "Sync now" route call it — and if the
 * workspace GUC were not set inside, the ingest would land in no tenant and
 * these assertions would come back empty.
 */

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:pull-evt-1@example.com",
  "SUMMARY:Renewal review",
  "DTSTART:20260708T130000Z",
  "DTEND:20260708T140000Z",
  "ATTENDEE;CN=Ada:mailto:ada@fernhill.example",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("pulling an account (Postgres, no outer transaction)", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let newId: typeof import("@/lib/id").newId;
  let server: Server;
  let base: string;
  let status = 200;
  let ws: string;
  let other: string;

  const account = async (workspace: string, url: string) => {
    const id = newId();
    await withWorkspace(workspace, () =>
      db.insert(tables.syncAccounts).values({
        id,
        provider: "ics",
        email: "me@myco.example",
        config: JSON.stringify({ url }),
        createdAt: Date.now(),
      }),
    );
    return id;
  };

  const accountRow = async (workspace: string, id: string) =>
    withWorkspace(
      workspace,
      async () =>
        (await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, id)).limit(1))[0]!,
    );

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ newId } = await import("@/lib/id"));
    ws = await createWorkspace();
    other = await createWorkspace();

    // The feed URL is SSRF-guarded, and a test server is on loopback.
    process.env.FOURTY_ALLOW_PRIVATE_WEBHOOKS = "1";
    server = createServer((_req, res) => {
      res.writeHead(status, { "content-type": "text/calendar" });
      res.end(status === 200 ? ICS : "nope");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterAll(async () => {
    delete process.env.FOURTY_ALLOW_PRIVATE_WEBHOOKS;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("ingests into the calling workspace and marks the account synced", async () => {
    status = 200;
    const id = await account(ws, `${base}/feed.ics`);

    const result = await pullAccount(ws, id); // deliberately unwrapped

    expect(result.ok).toBe(true);
    expect(result.ok && result.calendar?.ingested).toBe(1);

    const mine = await withWorkspace(ws, () => db.select().from(tables.calendarEvents));
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe("Renewal review");

    // The GUC was set inside, so the row belongs to one tenant and not the other.
    const theirs = await withWorkspace(other, () => db.select().from(tables.calendarEvents));
    expect(theirs).toHaveLength(0);

    const row = await accountRow(ws, id);
    expect(row.lastSyncedAt).not.toBeNull();
    expect(row.status).toBe("active");
    expect(row.lastError).toBeNull();
  });

  it("writes the failure onto the account rather than only a log", async () => {
    status = 500;
    const id = await account(ws, `${base}/broken.ics`);

    const result = await pullAccount(ws, id);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.status).toBe(502);
    const row = await accountRow(ws, id);
    expect(row.status).toBe("error");
    expect(row.lastError).toMatch(/500/);
    status = 200;
  });

  it("refuses an account in another workspace instead of reaching across", async () => {
    const id = await account(other, `${base}/feed.ics`);
    const result = await pullAccount(ws, id);
    expect(result.ok === false && result.status).toBe(404);
  });
});
