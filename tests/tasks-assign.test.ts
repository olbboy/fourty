import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Tasks are assignable to workspace members (ownerId) on every write surface.
 * An unknown id is refused; omitting ownerId keeps the previous default (the
 * caller, or unassigned for an API key).
 */
describe("task assignment", () => {
  const KEY = "frty_task_assign";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let taskRoutes: typeof import("@/app/api/tasks/route");
  let taskIdRoutes: typeof import("@/app/api/tasks/[id]/route");
  let assigneesRoute: typeof import("@/app/api/tasks/assignees/route");
  let ws: string;
  let ada: string;
  let grace: string;

  const headers = { Authorization: `Bearer ${KEY}`, "content-type": "application/json" };
  const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, { headers, ...init });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    taskRoutes = await import("@/app/api/tasks/route");
    taskIdRoutes = await import("@/app/api/tasks/[id]/route");
    assigneesRoute = await import("@/app/api/tasks/assignees/route");

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

  it("lists active members as assignees", async () => {
    const res = await assigneesRoute.GET(req("/api/tasks/assignees"));
    expect(res.status).toBe(200);
    const { assignees } = (await res.json()) as { assignees: { id: string; name: string }[] };
    expect(assignees.map((a) => a.id).sort()).toEqual([ada, grace].sort());
    expect(assignees.find((a) => a.id === ada)?.name).toBe("Ada Lovelace");
  });

  it("assigns on create, reassigns on patch, and refuses a stranger", async () => {
    const created = await taskRoutes.POST(
      req("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Ship v2", ownerId: ada }) }),
    );
    expect(created.status).toBe(201);
    const task = (await created.json()).task as { id: string; ownerId: string | null };
    expect(task.ownerId).toBe(ada);

    const moved = await taskIdRoutes.PATCH(
      req(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ ownerId: grace }) }),
      params(task.id),
    );
    expect(moved.status).toBe(200);
    expect((await moved.json()).task.ownerId).toBe(grace);

    const cleared = await taskIdRoutes.PATCH(
      req(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ ownerId: null }) }),
      params(task.id),
    );
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).task.ownerId).toBeNull();

    const bad = await taskRoutes.POST(
      req("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Ghost", ownerId: "not-a-member" }) }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/ownerId/);
  });

  it("omitting ownerId leaves an API-key create unassigned", async () => {
    const created = await taskRoutes.POST(req("/api/tasks", { method: "POST", body: JSON.stringify({ title: "No owner" }) }));
    expect(created.status).toBe(201);
    expect((await created.json()).task.ownerId).toBeNull();
  });

  it("lists the same assignees over GraphQL and MCP", async () => {
    const gql = await import("@/app/api/graphql/route");
    const listed = await gql.POST(
      req("/api/graphql", {
        method: "POST",
        body: JSON.stringify({ query: "{ assignees { id name } }" }),
      }),
    );
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { data: { assignees: { id: string; name: string }[] } };
    expect(body.data.assignees.map((a) => a.id).sort()).toEqual([ada, grace].sort());

    const { handleMcpRequest } = await import("@/mcp/server");
    const mcp = await handleMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_assignees", arguments: {} } },
      { workspaceId: ws, role: "admin", userId: null },
    );
    const result = mcp!.result as { content: { text: string }[]; isError?: boolean };
    expect(result.isError ?? false).toBe(false);
    const rows = JSON.parse(result.content[0].text) as { id: string; name: string }[];
    expect(rows.map((a) => a.id).sort()).toEqual([ada, grace].sort());
  });

  it("nests task.owner like deal.company", async () => {
    const created = await taskRoutes.POST(
      req("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Named owner", ownerId: ada }) }),
    );
    const id = (await created.json()).task.id as string;
    const gql = await import("@/app/api/graphql/route");
    const res = await gql.POST(
      req("/api/graphql", {
        method: "POST",
        body: JSON.stringify({ query: `query ($id: ID!) { task(id: $id) { owner { id name } } }`, variables: { id } }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { task: { owner: { id: string; name: string } | null } } };
    expect(body.data.task.owner).toEqual({ id: ada, name: "Ada Lovelace" });
  });
});
