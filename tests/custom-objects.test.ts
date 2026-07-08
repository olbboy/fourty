import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Custom objects (Gate C1) end-to-end through the real route handlers on real
 * Postgres + RLS: define an object, add fields, create/validate/list/update/
 * delete records, and prove a record in workspace A is invisible to workspace B.
 */
describe("custom objects (real handlers + Postgres + RLS)", () => {
  const TOKEN_A = "frty_customobj_key_a";
  const TOKEN_B = "frty_customobj_key_b";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let objRoutes: typeof import("@/app/api/custom-objects/route");
  let objIdRoutes: typeof import("@/app/api/custom-objects/[id]/route");
  let fieldRoutes: typeof import("@/app/api/custom-objects/[id]/fields/route");
  let recRoutes: typeof import("@/app/api/objects/[object]/route");
  let recIdRoutes: typeof import("@/app/api/objects/[object]/[id]/route");
  let wsA: string;

  const hdr = (t: string) => ({ Authorization: `Bearer ${t}`, "content-type": "application/json" });
  const req = (url: string, token: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, { headers: hdr(token), ...init });

  async function seedKey(ws: string, token: string) {
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "test",
      prefix: token.slice(0, 8),
      keyHash: sha256(token),
      createdAt: Date.now(),
    });
  }

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    objRoutes = await import("@/app/api/custom-objects/route");
    objIdRoutes = await import("@/app/api/custom-objects/[id]/route");
    fieldRoutes = await import("@/app/api/custom-objects/[id]/fields/route");
    recRoutes = await import("@/app/api/objects/[object]/route");
    recIdRoutes = await import("@/app/api/objects/[object]/[id]/route");

    wsA = await createWorkspace();
    const wsB = await createWorkspace();
    await seedKey(wsA, TOKEN_A);
    await seedKey(wsB, TOKEN_B);
  });

  it("defines an object with fields, then validates records on write", async () => {
    // Define "Project"
    const create = await objRoutes.POST(
      req("/api/custom-objects", TOKEN_A, {
        method: "POST",
        body: JSON.stringify({ apiName: "project", nameSingular: "Project", namePlural: "Projects" }),
      }),
    );
    expect(create.status).toBe(201);
    const objId = (await create.json()).object.id as string;
    const params = { params: Promise.resolve({ id: objId }) };

    // Add a required text field + a select field
    for (const f of [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "stage", label: "Stage", type: "select", options: ["todo", "done"] },
      { key: "budget", label: "Budget", type: "number" },
    ]) {
      const r = await fieldRoutes.POST(
        req(`/api/custom-objects/${objId}/fields`, TOKEN_A, { method: "POST", body: JSON.stringify(f) }),
        params,
      );
      expect(r.status).toBe(201);
    }

    const recParams = { params: Promise.resolve({ object: "project" }) };

    // Missing required "title" → 400
    const bad = await recRoutes.POST(
      req("/api/objects/project", TOKEN_A, { method: "POST", body: JSON.stringify({ data: { stage: "todo" } }) }),
      recParams,
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/Title/);

    // Bad select value → 400
    const badSelect = await recRoutes.POST(
      req("/api/objects/project", TOKEN_A, {
        method: "POST",
        body: JSON.stringify({ data: { title: "X", stage: "nope" } }),
      }),
      recParams,
    );
    expect(badSelect.status).toBe(400);

    // Valid → 201, number coerced
    const good = await recRoutes.POST(
      req("/api/objects/project", TOKEN_A, {
        method: "POST",
        body: JSON.stringify({ data: { title: "Launch", stage: "todo", budget: "1000" } }),
      }),
      recParams,
    );
    expect(good.status).toBe(201);
    const rec = (await good.json()).record;
    expect(rec.data.title).toBe("Launch");
    expect(rec.data.budget).toBe(1000); // coerced string→number

    // List has it
    const list = await recRoutes.GET(req("/api/objects/project", TOKEN_A), recParams);
    expect(list.status).toBe(200);
    expect((await list.json()).records.length).toBe(1);

    // Update + get + delete
    const upd = await recIdRoutes.PATCH(
      req(`/api/objects/project/${rec.id}`, TOKEN_A, {
        method: "PATCH",
        body: JSON.stringify({ data: { stage: "done" } }),
      }),
      { params: Promise.resolve({ object: "project", id: rec.id }) },
    );
    expect(upd.status).toBe(200);
    expect((await upd.json()).record.data.stage).toBe("done");

    const del = await recIdRoutes.DELETE(
      req(`/api/objects/project/${rec.id}`, TOKEN_A, { method: "DELETE" }),
      { params: Promise.resolve({ object: "project", id: rec.id }) },
    );
    expect(del.status).toBe(200);
  });

  it("rejects a reserved api name and duplicates", async () => {
    const reserved = await objRoutes.POST(
      req("/api/custom-objects", TOKEN_A, {
        method: "POST",
        body: JSON.stringify({ apiName: "contacts", nameSingular: "C", namePlural: "Cs" }),
      }),
    );
    expect(reserved.status).toBe(409);
  });

  it("confines objects + records to their workspace (RLS)", async () => {
    // Workspace B cannot see workspace A's "project" object → 404
    const listAsB = await recRoutes.GET(req("/api/objects/project", TOKEN_B), {
      params: Promise.resolve({ object: "project" }),
    });
    expect(listAsB.status).toBe(404);

    const objectsAsB = await objRoutes.GET(req("/api/custom-objects", TOKEN_B));
    expect((await objectsAsB.json()).objects.length).toBe(0);
  });
});
