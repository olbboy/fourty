import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Saved views (Gate C3) through the real handlers on Postgres + RLS: create/list/
 * update/delete, entity filtering, personal-vs-shared visibility, and
 * cross-workspace isolation. API-key callers have no user, so their views are
 * shared; a personal view (user_id set) is hidden from other callers.
 */
describe("saved views (real handlers + Postgres + RLS)", () => {
  const TOKEN_A = "frty_views_key_a";
  const TOKEN_B = "frty_views_key_b";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let routes: typeof import("@/app/api/saved-views/route");
  let idRoutes: typeof import("@/app/api/saved-views/[id]/route");
  let wsA: string;

  const hdr = (t: string) => ({ Authorization: `Bearer ${t}`, "content-type": "application/json" });
  const req = (url: string, token: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, { headers: hdr(token), ...init });

  async function seedKey(ws: string, token: string) {
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "t",
      prefix: token.slice(0, 8),
      keyHash: sha256(token),
      createdAt: Date.now(),
    });
  }

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    routes = await import("@/app/api/saved-views/route");
    idRoutes = await import("@/app/api/saved-views/[id]/route");

    wsA = await createWorkspace();
    const wsB = await createWorkspace();
    await seedKey(wsA, TOKEN_A);
    await seedKey(wsB, TOKEN_B);
  });

  it("creates, lists, updates, and deletes a shared view", async () => {
    const create = await routes.POST(
      req("/api/saved-views", TOKEN_A, {
        method: "POST",
        body: JSON.stringify({
          entity: "contacts",
          name: "Hot leads",
          config: { filters: { status: "lead" }, sort: "score", columns: ["firstName", "score"] },
        }),
      }),
    );
    expect(create.status).toBe(201);
    const view = (await create.json()).view;
    expect(view.shared).toBe(true);
    expect(view.config.sort).toBe("score");

    const list = await routes.GET(req("/api/saved-views?entity=contacts", TOKEN_A));
    expect((await list.json()).views.some((v: { id: string }) => v.id === view.id)).toBe(true);

    // Entity filter excludes it from a different entity.
    const otherEntity = await routes.GET(req("/api/saved-views?entity=deals", TOKEN_A));
    expect((await otherEntity.json()).views.some((v: { id: string }) => v.id === view.id)).toBe(false);

    const upd = await idRoutes.PATCH(
      req(`/api/saved-views/${view.id}`, TOKEN_A, {
        method: "PATCH",
        body: JSON.stringify({ name: "Hottest leads" }),
      }),
      { params: Promise.resolve({ id: view.id }) },
    );
    expect((await upd.json()).view.name).toBe("Hottest leads");

    const del = await idRoutes.DELETE(req(`/api/saved-views/${view.id}`, TOKEN_A, { method: "DELETE" }), {
      params: Promise.resolve({ id: view.id }),
    });
    expect(del.status).toBe(200);
  });

  it("hides a personal view (user_id set) from other callers", async () => {
    // Insert a personal view owned by some user in workspace A.
    const personalId = newId();
    await withWorkspace(wsA, async () => {
      await db.insert(tables.savedViews).values({
        id: personalId,
        entity: "contacts",
        name: "My private view",
        config: "{}",
        userId: "some-other-user",
        createdAt: Date.now(),
      });
    });
    // The API-key caller (no user) sees only shared views → not this one.
    const list = await routes.GET(req("/api/saved-views?entity=contacts", TOKEN_A));
    expect((await list.json()).views.some((v: { id: string }) => v.id === personalId)).toBe(false);
  });

  it("confines views to their workspace (RLS)", async () => {
    const create = await routes.POST(
      req("/api/saved-views", TOKEN_A, {
        method: "POST",
        body: JSON.stringify({ entity: "companies", name: "WS-A only", config: {} }),
      }),
    );
    const id = (await create.json()).view.id;
    const asB = await idRoutes.GET(req(`/api/saved-views/${id}`, TOKEN_B), {
      params: Promise.resolve({ id }),
    });
    expect(asB.status).toBe(404);
  });
});
