import { beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * TENANT ISOLATION ATTACK SUITE — the definition of done for Gate B2.
 *
 * Two workspaces (A, B), each with its own API key and data. Every cross-tenant
 * access attempt through the real REST handlers must fail (404 — the row is
 * invisible), and a direct database connection proves RLS enforces isolation
 * independently of the application code. If any assertion here is weakened,
 * skipped, or deleted to make CI pass, that is a security regression.
 */
describe("tenant isolation", () => {
  const KA = "frty_key_workspace_a";
  const KB = "frty_key_workspace_b";
  const APP_DSN =
    process.env.DATABASE_URL ?? "postgresql://fourty_app:fourty_app@localhost:5432/fourty_test";

  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let contacts: typeof import("@/app/api/contacts/route");
  let contactsId: typeof import("@/app/api/contacts/[id]/route");
  let deals: typeof import("@/app/api/deals/route");
  let dealsId: typeof import("@/app/api/deals/[id]/route");

  let wsA: string;
  let wsB: string;
  let contactA: { id: string };
  let contactB: { id: string };
  let dealA: { id: string };
  let dealB: { id: string };

  const reqWith = (token: string, url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, {
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...init,
    });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    contacts = await import("@/app/api/contacts/route");
    contactsId = await import("@/app/api/contacts/[id]/route");
    deals = await import("@/app/api/deals/route");
    dealsId = await import("@/app/api/deals/[id]/route");

    wsA = await createWorkspace({ name: "Alpha" });
    wsB = await createWorkspace({ name: "Beta" });
    for (const [ws, token] of [
      [wsA, KA],
      [wsB, KB],
    ] as const) {
      await db.insert(tables.apiKeys).values({
        id: newId(),
        workspaceId: ws,
        name: "k",
        prefix: token.slice(0, 8),
        keyHash: sha256(token),
        createdAt: Date.now(),
      });
    }

    // Seed one contact + one deal in each workspace via the real handlers.
    contactA = (
      await (
        await contacts.POST(
          reqWith(KA, "/api/contacts", { method: "POST", body: JSON.stringify({ firstName: "Alice-A" }) }),
        )
      ).json()
    ).contact;
    contactB = (
      await (
        await contacts.POST(
          reqWith(KB, "/api/contacts", { method: "POST", body: JSON.stringify({ firstName: "Bob-B" }) }),
        )
      ).json()
    ).contact;
    dealA = (
      await (
        await deals.POST(reqWith(KA, "/api/deals", { method: "POST", body: JSON.stringify({ name: "Deal-A" }) }))
      ).json()
    ).deal;
    dealB = (
      await (
        await deals.POST(reqWith(KB, "/api/deals", { method: "POST", body: JSON.stringify({ name: "Deal-B" }) }))
      ).json()
    ).deal;
  });

  it("list endpoints only return the caller's workspace", async () => {
    const listA = (await (await contacts.GET(reqWith(KA, "/api/contacts"))).json()).contacts as {
      id: string;
    }[];
    const idsA = listA.map((c) => c.id);
    expect(idsA).toContain(contactA.id);
    expect(idsA).not.toContain(contactB.id);

    const listB = (await (await contacts.GET(reqWith(KB, "/api/contacts"))).json()).contacts as {
      id: string;
    }[];
    const idsB = listB.map((c) => c.id);
    expect(idsB).toContain(contactB.id);
    expect(idsB).not.toContain(contactA.id);
  });

  it("cross-tenant GET by id is 404 (contacts + deals)", async () => {
    const c = await contactsId.GET(reqWith(KA, `/api/contacts/${contactB.id}`), {
      params: Promise.resolve({ id: contactB.id }),
    });
    expect(c.status).toBe(404);
    const d = await dealsId.GET(reqWith(KA, `/api/deals/${dealB.id}`), {
      params: Promise.resolve({ id: dealB.id }),
    });
    expect(d.status).toBe(404);
  });

  it("cross-tenant UPDATE by id is 404 and does not mutate the other tenant", async () => {
    const res = await contactsId.PATCH(
      reqWith(KA, `/api/contacts/${contactB.id}`, {
        method: "PATCH",
        body: JSON.stringify({ firstName: "HACKED" }),
      }),
      { params: Promise.resolve({ id: contactB.id }) },
    );
    expect(res.status).toBe(404);
    // Verify B's record is untouched (read it as B).
    const asB = await contactsId.GET(reqWith(KB, `/api/contacts/${contactB.id}`), {
      params: Promise.resolve({ id: contactB.id }),
    });
    expect((await asB.json()).contact.firstName).toBe("Bob-B");
  });

  it("cross-tenant DELETE by id is 404 and does not delete the other tenant", async () => {
    const res = await dealsId.DELETE(reqWith(KA, `/api/deals/${dealB.id}`), {
      params: Promise.resolve({ id: dealB.id }),
    });
    expect(res.status).toBe(404);
    // B can still read its deal.
    const asB = await dealsId.GET(reqWith(KB, `/api/deals/${dealB.id}`), {
      params: Promise.resolve({ id: dealB.id }),
    });
    expect(asB.status).toBe(200);
  });

  it("an API key can only ever act within its own workspace", async () => {
    // KA creating a contact lands in workspace A, never B.
    const created = (
      await (
        await contacts.POST(
          reqWith(KA, "/api/contacts", { method: "POST", body: JSON.stringify({ firstName: "New-A" }) }),
        )
      ).json()
    ).contact;
    const asB = await contactsId.GET(reqWith(KB, `/api/contacts/${created.id}`), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(asB.status).toBe(404); // invisible to B
  });

  it("RLS enforces isolation at the database, independently of app code", async () => {
    const client = new pg.Client({ connectionString: APP_DSN }); // connects as fourty_app
    await client.connect();
    try {
      // In A's context: sees A's contact, not B's.
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [wsA]);
      const inA = (await client.query("SELECT id FROM contacts")).rows.map((r) => r.id);
      expect(inA).toContain(contactA.id);
      expect(inA).not.toContain(contactB.id);
      await client.query("COMMIT");

      // No context set → zero rows (fail closed).
      const noCtx = (await client.query("SELECT id FROM contacts")).rows;
      expect(noCtx.length).toBe(0);

      // Cross-tenant write: in B's context, inserting a row tagged for A is
      // rejected by the WITH CHECK policy.
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [wsB]);
      await expect(
        client.query(
          "INSERT INTO contacts (id, workspace_id, first_name, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)",
          [newId(), wsA, "Mallory", Date.now(), Date.now()],
        ),
      ).rejects.toThrow();
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  });
});
