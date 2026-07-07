import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "./pg-setup";

/**
 * Integration tests that drive the REAL Next.js route handlers against real
 * Postgres, authenticated with a real API key. Evidence that CRUD, validation,
 * and workflow dispatch work end-to-end after the SQLite→Postgres port.
 */
describe("REST API integration (real handlers + Postgres)", () => {
  const TOKEN = "frty_integration_test_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let contactRoutes: typeof import("@/app/api/contacts/route");
  let dealRoutes: typeof import("@/app/api/deals/route");
  let dealIdRoutes: typeof import("@/app/api/deals/[id]/route");

  const auth = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
  const req = (url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, { headers: auth, ...init });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    contactRoutes = await import("@/app/api/contacts/route");
    dealRoutes = await import("@/app/api/deals/route");
    dealIdRoutes = await import("@/app/api/deals/[id]/route");

    await db.insert(tables.apiKeys).values({
      id: newId(),
      name: "test",
      prefix: TOKEN.slice(0, 8),
      keyHash: sha256(TOKEN),
      createdAt: Date.now(),
    });
  });

  it("creates, lists, and reads a contact", async () => {
    const res = await contactRoutes.POST(
      req("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Grace", lastName: "Hopper", email: "grace@navy.mil" }),
      }),
    );
    expect(res.status).toBe(201);
    const { contact } = await res.json();
    expect(contact.firstName).toBe("Grace");
    expect(contact.id).toBeTruthy();
    expect(typeof contact.score).toBe("number");

    const listRes = await contactRoutes.GET(req("/api/contacts"));
    expect(listRes.status).toBe(200);
    const { contacts } = await listRes.json();
    expect(contacts.some((c: { email: string }) => c.email === "grace@navy.mil")).toBe(true);
  });

  it("rejects invalid contact input with 400 and a field message", async () => {
    const res = await contactRoutes.POST(
      req("/api/contacts", { method: "POST", body: JSON.stringify({ lastName: "NoFirstName" }) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/firstName/);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await contactRoutes.POST(
      req("/api/contacts", { method: "POST", body: "{not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a deal in the default pipeline and moves it through stages, firing workflows", async () => {
    await db.insert(tables.workflows).values({
      id: newId(),
      name: "note on won",
      enabled: 1,
      trigger: JSON.stringify({ event: "deal.won" }),
      conditions: "[]",
      actions: JSON.stringify([{ type: "add_note", body: "won {{name}}" }]),
      createdAt: Date.now(),
    });

    const createRes = await dealRoutes.POST(
      req("/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Big deal", amount: 50000, currency: "USD" }),
      }),
    );
    expect(createRes.status).toBe(201);
    const { deal } = await createRes.json();
    expect(deal.pipelineId).toBeTruthy();
    expect(deal.stageId).toBeTruthy();
    expect(deal.closedAt).toBeNull();

    const wonStage = (await db.select().from(tables.stages)).find(
      (s) => s.pipelineId === deal.pipelineId && s.type === "won",
    )!;
    expect(wonStage).toBeTruthy();

    const patchRes = await dealIdRoutes.PATCH(
      req(`/api/deals/${deal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stageId: wonStage.id }),
      }),
      { params: Promise.resolve({ id: deal.id }) },
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()).deal;
    expect(patched.stageId).toBe(wonStage.id);
    expect(patched.closedAt).toBeGreaterThan(0);

    const notes = (await db.select().from(tables.notes)).filter((n) => n.entityId === deal.id);
    expect(notes.some((n) => n.body === "won Big deal")).toBe(true);

    const acts = (await db.select().from(tables.activities)).filter(
      (a) => a.entityId === deal.id && a.type === "stage_changed",
    );
    expect(acts.length).toBe(1);
  });

  it("rejects an invalid stage transition", async () => {
    const createRes = await dealRoutes.POST(
      req("/api/deals", { method: "POST", body: JSON.stringify({ name: "Deal 2" }) }),
    );
    const { deal } = await createRes.json();
    const patchRes = await dealIdRoutes.PATCH(
      req(`/api/deals/${deal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stageId: "does-not-exist" }),
      }),
      { params: Promise.resolve({ id: deal.id }) },
    );
    expect(patchRes.status).toBe(400);
  });

  it("returns 404 for a missing deal", async () => {
    const res = await dealIdRoutes.GET(req("/api/deals/nope"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});
