import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Integration tests driving the REAL route handlers against real Postgres with
 * RLS. The API key belongs to a workspace; each route self-scopes to it via
 * withAuth → withWorkspace. Direct DB reads/writes in the test use
 * withWorkspace() explicitly.
 */
describe("REST API integration (real handlers + Postgres + RLS)", () => {
  const TOKEN = "frty_integration_test_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let contactRoutes: typeof import("@/app/api/contacts/route");
  let contactIdRoutes: typeof import("@/app/api/contacts/[id]/route");
  let dealRoutes: typeof import("@/app/api/deals/route");
  let dealIdRoutes: typeof import("@/app/api/deals/[id]/route");
  let factsRoutes: typeof import("@/app/api/facts/route");
  let factsIdRoutes: typeof import("@/app/api/facts/[id]/route");
  let activityRoutes: typeof import("@/app/api/activities/route");
  let ws: string;

  const auth = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
  const req = (url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, { headers: auth, ...init });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    contactRoutes = await import("@/app/api/contacts/route");
    contactIdRoutes = await import("@/app/api/contacts/[id]/route");
    dealRoutes = await import("@/app/api/deals/route");
    dealIdRoutes = await import("@/app/api/deals/[id]/route");
    factsRoutes = await import("@/app/api/facts/route");
    factsIdRoutes = await import("@/app/api/facts/[id]/route");
    activityRoutes = await import("@/app/api/activities/route");

    ws = await createWorkspace();
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
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
    await withWorkspace(ws, async () => {
      await db.insert(tables.workflows).values({
        id: newId(),
        name: "note on won",
        enabled: 1,
        trigger: JSON.stringify({ event: "deal.won" }),
        conditions: "[]",
        actions: JSON.stringify([{ type: "add_note", body: "won {{name}}" }]),
        createdAt: Date.now(),
      });
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

    const wonStage = await withWorkspace(ws, async () =>
      (await db.select().from(tables.stages)).find(
        (s) => s.pipelineId === deal.pipelineId && s.type === "won",
      ),
    );
    expect(wonStage).toBeTruthy();

    const patchRes = await dealIdRoutes.PATCH(
      req(`/api/deals/${deal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ stageId: wonStage!.id }),
      }),
      { params: Promise.resolve({ id: deal.id }) },
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()).deal;
    expect(patched.stageId).toBe(wonStage!.id);
    expect(patched.closedAt).toBeGreaterThan(0);

    await withWorkspace(ws, async () => {
      const notes = (await db.select().from(tables.notes)).filter((n) => n.entityId === deal.id);
      expect(notes.some((n) => n.body === "won Big deal")).toBe(true);
      const acts = (await db.select().from(tables.activities)).filter(
        (a) => a.entityId === deal.id && a.type === "stage_changed",
      );
      expect(acts.length).toBe(1);
    });
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

  it("records, lists, and accepts a fact suggestion over REST", async () => {
    const created = await contactRoutes.POST(
      req("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Fact", lastName: "Rest" }),
      }),
    );
    expect(created.status).toBe(201);
    const contactId = (await created.json()).contact.id as string;

    const recorded = await factsRoutes.POST(
      req("/api/facts", {
        method: "POST",
        body: JSON.stringify({
          entityType: "contact",
          entityId: contactId,
          field: "job_title",
          value: "Head of Ops",
          evidence: [{ kind: "crm.signature-block", detail: "their signature on 14 July reads Head of Ops" }],
        }),
      }),
    );
    expect(recorded.status).toBe(201);
    const { result } = await recorded.json();
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.fact.band).toBe("PROBABLE");
    const factId = result.fact.id as string;

    const listed = await factsRoutes.GET(req(`/api/facts?entityType=contact&entityId=${contactId}`));
    expect(listed.status).toBe(200);
    const { facts } = await listed.json();
    expect(facts.some((f: { id: string }) => f.id === factId)).toBe(true);

    const decided = await factsIdRoutes.PATCH(
      req(`/api/facts/${factId}`, {
        method: "PATCH",
        body: JSON.stringify({ decision: "accept" }),
      }),
      { params: Promise.resolve({ id: factId }) },
    );
    expect(decided.status).toBe(200);
    const accepted = (await decided.json()).result;
    expect(accepted.ok).toBe(true);
    expect(accepted.fact.status).toBe("APPLIED");

    const after = await contactIdRoutes.GET(req(`/api/contacts/${contactId}`), {
      params: Promise.resolve({ id: contactId }),
    });
    expect((await after.json()).contact.jobTitle).toBe("Head of Ops");
  });

  it("logs a touchpoint on a contact timeline and does not dump the workspace", async () => {
    const created = await contactRoutes.POST(
      req("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Call", lastName: "Target" }),
      }),
    );
    const contactId = (await created.json()).contact.id as string;

    const logged = await activityRoutes.POST(
      req("/api/activities", {
        method: "POST",
        body: JSON.stringify({ type: "call", entityType: "contact", entityId: contactId, note: "Intro call" }),
      }),
    );
    expect(logged.status).toBe(201);

    const listed = await activityRoutes.GET(req(`/api/activities?entityType=contact&entityId=${contactId}`));
    expect(listed.status).toBe(200);
    const rows = (await listed.json()).activities as { type: string; meta: { note?: string } }[];
    expect(rows.some((a) => a.type === "call" && a.meta.note === "Intro call")).toBe(true);
    expect(rows.some((a) => a.type === "created")).toBe(true);

    const unscoped = await activityRoutes.GET(req("/api/activities"));
    expect(unscoped.status).toBe(200);
    expect((await unscoped.json()).activities).toEqual([]);
  });
});
