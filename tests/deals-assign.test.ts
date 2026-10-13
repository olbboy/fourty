import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * A deal's Owner is assignable to a workspace member on every write surface,
 * the same way a task's is. An unknown id is refused; omitting ownerId keeps
 * the previous default (the caller, or unassigned for an API key).
 */
describe("deal owner assignment", () => {
  const KEY = "frty_deal_assign";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let dealRoutes: typeof import("@/app/api/deals/route");
  let dealIdRoutes: typeof import("@/app/api/deals/[id]/route");
  let ws: string;
  let ada: string;
  let grace: string;

  const headers = { Authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, { headers, ...init });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const createDeal = (body: Record<string, unknown>) =>
    dealRoutes.POST(req("/api/deals", { method: "POST", body: JSON.stringify(body) }));

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    dealRoutes = await import("@/app/api/deals/route");
    dealIdRoutes = await import("@/app/api/deals/[id]/route");

    ws = await createWorkspace();
    ada = newId();
    grace = newId();
    await withWorkspace(ws, async () => {
      await db.insert(tables.apiKeys).values({
        id: newId(),
        workspaceId: ws,
        name: "admin",
        prefix: KEY.slice(0, 8),
        keyHash: sha256(KEY),
        role: "admin",
        createdAt: Date.now(),
      });
      await db.insert(tables.users).values([
        { id: ada, email: `ada-${ada}@t.dev`, name: "Ada Lovelace", passwordHash: "s:h", role: "member", createdAt: Date.now() },
        { id: grace, email: `grace-${grace}@t.dev`, name: "Grace Hopper", passwordHash: "s:h", role: "member", createdAt: Date.now() },
      ]);
      await db.insert(tables.workspaceMembers).values([
        { id: newId(), workspaceId: ws, userId: ada, role: "member", createdAt: Date.now() },
        { id: newId(), workspaceId: ws, userId: grace, role: "member", createdAt: Date.now() },
      ]);
    });
  });

  it("assigns the owner given on create", async () => {
    const res = await createDeal({ name: "Viễn thông Sao Mai — BTS storage", ownerId: ada });
    expect(res.status).toBe(201);
    expect((await res.json()).deal.ownerId).toBe(ada);
  });

  it("reassigns on patch, clears with null, and refuses a stranger", async () => {
    const deal = (await (await createDeal({ name: "Vina Net — UPS batteries", ownerId: ada })).json()).deal as { id: string };
    const patchDeal = (body: Record<string, unknown>) =>
      dealIdRoutes.PATCH(
        req(`/api/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify(body) }),
        params(deal.id),
      );

    const moved = await patchDeal({ ownerId: grace });
    expect(moved.status).toBe(200);
    expect((await moved.json()).deal.ownerId).toBe(grace);

    const stranger = await patchDeal({ ownerId: "not-a-member" });
    expect(stranger.status).toBe(400);
    expect((await stranger.json()).error).toMatch(/ownerId/);

    const cleared = await patchDeal({ ownerId: null });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).deal.ownerId).toBeNull();
  });

  it("records an owner change on the deal's timeline with both names", async () => {
    const deal = (await (await createDeal({ name: "Viễn thông Mekong — BTS storage", ownerId: ada })).json()).deal as { id: string };
    await dealIdRoutes.PATCH(
      req(`/api/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ ownerId: grace }) }),
      params(deal.id),
    );

    const activityRoutes = await import("@/app/api/activities/route");
    const res = await activityRoutes.GET(req(`/api/activities?entityType=deal&entityId=${deal.id}`));
    expect(res.status).toBe(200);
    const { activities } = (await res.json()) as { activities: { type: string; meta: Record<string, unknown> }[] };
    const change = activities.find((a) => a.type === "owner_changed");
    expect(change?.meta).toMatchObject({ from: "Ada Lovelace", to: "Grace Hopper" });
  });

  it("keeps a departed owner's name when the deal is handed over", async () => {
    const linus = newId();
    await withWorkspace(ws, async () => {
      await db.insert(tables.users).values({
        id: linus, email: `linus-${linus}@t.dev`, name: "Linus Pauling", passwordHash: "s:h", role: "member", createdAt: Date.now(),
      });
      await db.insert(tables.workspaceMembers).values({ id: newId(), workspaceId: ws, userId: linus, role: "member", createdAt: Date.now() });
    });
    const deal = (await (await createDeal({ name: "Fiesta — solar", ownerId: linus })).json()).deal as { id: string };
    await withWorkspace(ws, async () => {
      await db.update(tables.workspaceMembers).set({ deactivatedAt: Date.now() }).where(eq(tables.workspaceMembers.userId, linus));
    });

    await dealIdRoutes.PATCH(
      req(`/api/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ ownerId: grace }) }),
      params(deal.id),
    );

    const activityRoutes = await import("@/app/api/activities/route");
    const res = await activityRoutes.GET(req(`/api/activities?entityType=deal&entityId=${deal.id}`));
    const { activities } = (await res.json()) as { activities: { type: string; meta: Record<string, unknown> }[] };
    expect(activities.find((a) => a.type === "owner_changed")?.meta).toMatchObject({ from: "Linus Pauling", to: "Grace Hopper" });
  });

  it("nests deal.owner over GraphQL like task.owner", async () => {
    const id = (await (await createDeal({ name: "Điện lực — substation storage", ownerId: ada })).json()).deal.id as string;
    const gql = await import("@/app/api/graphql/route");
    const res = await gql.POST(
      req("/api/graphql", {
        method: "POST",
        body: JSON.stringify({ query: `query ($id: ID!) { deal(id: $id) { ownerId owner { id name } } }`, variables: { id } }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { deal: { ownerId: string; owner: { id: string; name: string } | null } } };
    expect(body.data.deal).toEqual({ ownerId: ada, owner: { id: ada, name: "Ada Lovelace" } });
  });

  it("assigns the owner through MCP create_deal", async () => {
    const { handleMcpRequest } = await import("@/mcp/server");
    const mcp = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_deal", arguments: { name: "Thành Phát — stock sale", ownerId: grace } },
      },
      { workspaceId: ws, role: "admin", userId: null },
    );
    const result = mcp!.result as { content: { text: string }[]; isError?: boolean };
    expect(result.isError ?? false).toBe(false);
    expect((JSON.parse(result.content[0].text) as { ownerId: string }).ownerId).toBe(grace);
  });

  it("neither lists nor accepts a member of another workspace", async () => {
    // workspace_members has no row-level security (login needs every
    // membership), so the assignee helpers must scope it themselves.
    const other = await createWorkspace();
    const mallory = newId();
    await withWorkspace(other, async () => {
      await db.insert(tables.users).values({
        id: mallory, email: `mallory-${mallory}@t.dev`, name: "Mallory Other", passwordHash: "s:h", role: "member", createdAt: Date.now(),
      });
      await db.insert(tables.workspaceMembers).values({ id: newId(), workspaceId: other, userId: mallory, role: "member", createdAt: Date.now() });
    });

    const assigneesRoute = await import("@/app/api/tasks/assignees/route");
    const listed = (await (await assigneesRoute.GET(req("/api/tasks/assignees"))).json()) as { assignees: { id: string }[] };
    expect(listed.assignees.map((a) => a.id)).not.toContain(mallory);

    const created = await createDeal({ name: "Cross-tenant owner", ownerId: mallory });
    expect(created.status).toBe(400);
  });

  it("refuses a stranger on create", async () => {
    const res = await createDeal({ name: "Ghost deal", ownerId: "not-a-member" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ownerId/);
  });

  it("omitting ownerId leaves an API-key create unassigned", async () => {
    const res = await createDeal({ name: "No owner" });
    expect(res.status).toBe(201);
    expect((await res.json()).deal.ownerId).toBeNull();
  });
});
