import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";
import { handleMcpRequest, MCP_PROTOCOL_VERSION } from "@/mcp/server";
import type { ToolContext } from "@/mcp/tools";

/**
 * Fourty MCP server (Gate B6/D) driven through handleMcpRequest against real
 * Postgres + RLS: protocol handshake, tool listing, tool calls (read + write),
 * RBAC (viewer denied writes), custom-object records, and cross-workspace
 * isolation. The stdio transport just authenticates + pipes this handler.
 */
describe("MCP server (handler + Postgres + RLS)", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let newId: typeof import("@/lib/id").newId;
  let ctxA: ToolContext;
  let ctxB: ToolContext;
  let viewerCtx: ToolContext;

  const call = (ctx: ToolContext, method: string, params?: Record<string, unknown>) =>
    handleMcpRequest({ jsonrpc: "2.0", id: 1, method, params }, ctx);

  const callTool = async (ctx: ToolContext, name: string, args: Record<string, unknown> = {}) => {
    const res = await call(ctx, "tools/call", { name, arguments: args });
    const result = res!.result as { content: { text: string }[]; isError?: boolean };
    return { isError: result.isError ?? false, data: result.isError ? result.content[0].text : JSON.parse(result.content[0].text) };
  };

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ newId } = await import("@/lib/id"));
    const wsA = await createWorkspace();
    const wsB = await createWorkspace();
    ctxA = { workspaceId: wsA, role: "admin", userId: null };
    ctxB = { workspaceId: wsB, role: "admin", userId: null };
    viewerCtx = { workspaceId: wsA, role: "viewer", userId: null };
  });

  it("initialize returns protocol version + server info", async () => {
    const res = await call(ctxA, "initialize");
    const result = res!.result as { protocolVersion: string; serverInfo: { name: string } };
    expect(result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(result.serverInfo.name).toBe("fourty");
  });

  it("tools/list advertises the tool set with input schemas", async () => {
    const res = await call(ctxA, "tools/list");
    const { tools } = res!.result as { tools: { name: string; inputSchema: unknown }[] };
    const names = tools.map((t) => t.name);
    expect(names).toContain("create_contact");
    expect(names).toContain("search");
    expect(names).toContain("get_dashboard_stats");
    expect(tools.every((t) => typeof t.inputSchema === "object")).toBe(true);
  });

  it("notifications return no response", async () => {
    const res = await handleMcpRequest({ jsonrpc: "2.0", method: "notifications/initialized" }, ctxA);
    expect(res).toBeNull();
  });

  it("create_contact + search round-trip inside the workspace", async () => {
    const created = await callTool(ctxA, "create_contact", {
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@navy.mil",
    });
    expect(created.isError).toBe(false);
    expect(created.data.id).toBeTruthy();
    expect(typeof created.data.score).toBe("number");

    const found = await callTool(ctxA, "search", { query: "grace" });
    expect(found.data.contacts.some((c: { email: string }) => c.email === "grace@navy.mil")).toBe(true);
  });

  it("denies a viewer from create_contact (RBAC)", async () => {
    const res = await callTool(viewerCtx, "create_contact", { firstName: "Nope" });
    expect(res.isError).toBe(true);
    expect(res.data).toMatch(/Forbidden/);
    // Viewer can still read.
    const read = await callTool(viewerCtx, "list_contacts", {});
    expect(read.isError).toBe(false);
  });

  it("supports custom object records via MCP", async () => {
    const { withWorkspace } = await import("@/db");
    const objId = newId();
    await withWorkspace(ctxA.workspaceId, async () => {
      await db.insert(tables.customObjects).values({
        id: objId,
        apiName: "asset",
        nameSingular: "Asset",
        namePlural: "Assets",
        createdAt: Date.now(),
      });
      await db.insert(tables.customObjectFields).values({
        id: newId(),
        objectId: objId,
        key: "tag",
        label: "Tag",
        type: "text",
        required: 1,
        order: 0,
        createdAt: Date.now(),
      });
    });
    const created = await callTool(ctxA, "create_record", { object: "asset", data: { tag: "laptop-01" } });
    expect(created.isError).toBe(false);
    expect(created.data.data.tag).toBe("laptop-01");

    const bad = await callTool(ctxA, "create_record", { object: "asset", data: {} });
    expect(bad.isError).toBe(true); // missing required field

    const records = await callTool(ctxA, "list_records", { object: "asset" });
    expect(records.data.length).toBe(1);
  });

  it("confines tool results to the caller's workspace (RLS)", async () => {
    const asB = await callTool(ctxB, "search", { query: "grace" });
    expect(asB.data.contacts.length).toBe(0);
    const objB = await callTool(ctxB, "list_records", { object: "asset" });
    expect(objB.isError).toBe(true); // asset object belongs to workspace A
  });

  it("unknown method returns a JSON-RPC error", async () => {
    const res = await call(ctxA, "does/not/exist");
    expect(res!.error?.code).toBe(-32601);
  });

  it("enforces field-level permissions (redacts reads, blocks writes)", async () => {
    const { withWorkspace } = await import("@/db");
    const wsA = ctxA.workspaceId;
    // viewer cannot read contacts.email; member cannot write contacts.status.
    await withWorkspace(wsA, async () => {
      await db.insert(tables.fieldPermissions).values([
        { id: newId(), object: "contacts", field: "email", role: "viewer", canRead: 0, canWrite: 0, createdAt: Date.now() },
        { id: newId(), object: "contacts", field: "status", role: "member", canRead: 1, canWrite: 0, createdAt: Date.now() },
      ]);
    });
    const memberCtx: ToolContext = { workspaceId: wsA, role: "member", userId: null };

    // Viewer sees contacts but the email field is stripped; admin still sees it.
    const asViewer = await callTool(viewerCtx, "list_contacts", {});
    expect(asViewer.isError).toBe(false);
    expect(asViewer.data.length).toBeGreaterThan(0);
    expect(asViewer.data.every((c: Record<string, unknown>) => !("email" in c))).toBe(true);
    const asAdmin = await callTool(ctxA, "list_contacts", {});
    expect(asAdmin.data.some((c: { email?: string }) => c.email === "grace@navy.mil")).toBe(true);
    // search is redacted too.
    const search = await callTool(viewerCtx, "search", { query: "grace" });
    expect(search.data.contacts.every((c: Record<string, unknown>) => !("email" in c))).toBe(true);

    // Member cannot write the blocked field; omitting it works.
    const blocked = await callTool(memberCtx, "create_contact", { firstName: "Blocked", status: "customer" });
    expect(blocked.isError).toBe(true);
    expect(blocked.data).toMatch(/status/);
    const ok = await callTool(memberCtx, "create_contact", { firstName: "Allowed" });
    expect(ok.isError).toBe(false);
  });

  // ── ADR-015 Tier 1: broadened MCP surface (CRUD + tasks/notes + resources/prompts) ──
  // These run as admin (ctxA), which bypasses the field-permission rules the test
  // above installed, so they exercise the new tools in isolation.

  it("expands the tool catalogue with CRUD + task/note tools", async () => {
    const res = await call(ctxA, "tools/list");
    const { tools } = res!.result as { tools: { name: string }[] };
    const names = tools.map((t) => t.name);
    for (const n of [
      "update_contact", "delete_contact", "update_company", "delete_company",
      "create_deal", "update_deal", "delete_deal", "create_task", "list_tasks", "create_note",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("update_contact changes only the passed fields", async () => {
    const created = await callTool(ctxA, "create_contact", { firstName: "Ada", lastName: "Lovelace" });
    const updated = await callTool(ctxA, "update_contact", { id: created.data.id, jobTitle: "Analyst", status: "qualified" });
    expect(updated.isError).toBe(false);
    expect(updated.data.jobTitle).toBe("Analyst");
    expect(updated.data.status).toBe("qualified");
    expect(updated.data.firstName).toBe("Ada"); // untouched
  });

  it("delete_contact is a dry run unless confirm=true", async () => {
    const created = await callTool(ctxA, "create_contact", { firstName: "Temp", lastName: "Delete" });
    const dry = await callTool(ctxA, "delete_contact", { id: created.data.id });
    expect(dry.isError).toBe(false);
    expect(dry.data.dryRun).toBe(true);
    const stillThere = await callTool(ctxA, "list_contacts", { query: "Temp" });
    expect(stillThere.data.some((c: { id: string }) => c.id === created.data.id)).toBe(true);

    const del = await callTool(ctxA, "delete_contact", { id: created.data.id, confirm: true });
    expect(del.data.deleted).toBe(true);
    const gone = await callTool(ctxA, "list_contacts", { query: "Temp" });
    expect(gone.data.some((c: { id: string }) => c.id === created.data.id)).toBe(false);
  });

  it("create_deal returns a health score; update_deal advances the stage to won (100)", async () => {
    const deal = await callTool(ctxA, "create_deal", { name: "MCP Deal", amount: 1000 });
    expect(deal.isError).toBe(false);
    expect(typeof deal.data.score).toBe("number");

    const { withWorkspace } = await import("@/db");
    const wonStageId = await withWorkspace(ctxA.workspaceId, async () =>
      (await db.select().from(tables.stages).where(eq(tables.stages.type, "won")).limit(1))[0]?.id,
    );
    expect(wonStageId).toBeTruthy();
    const moved = await callTool(ctxA, "update_deal", { id: deal.data.id, stageId: wonStageId });
    expect(moved.isError).toBe(false);
    expect(moved.data.score).toBe(100); // won → certain
  });

  it("create_task, create_note, list_tasks round-trip", async () => {
    const t = await callTool(ctxA, "create_task", { title: "Call Ada", priority: "high" });
    expect(t.isError).toBe(false);
    expect(t.data.title).toBe("Call Ada");

    const contact = await callTool(ctxA, "create_contact", { firstName: "Note", lastName: "Target" });
    const n = await callTool(ctxA, "create_note", { body: "hello", entityType: "contact", entityId: contact.data.id });
    expect(n.isError).toBe(false);
    expect(n.data.body).toBe("hello");

    const tasks = await callTool(ctxA, "list_tasks", {});
    expect(Array.isArray(tasks.data)).toBe(true);
    expect(tasks.data.some((x: { title: string }) => x.title === "Call Ada")).toBe(true);
  });

  it("serves MCP resources (list + read) under the same RLS/RBAC path", async () => {
    const list = await call(ctxA, "resources/list");
    const { resources } = list!.result as { resources: { uri: string }[] };
    expect(resources.some((r) => r.uri === "fourty://dashboard")).toBe(true);

    const read = await call(ctxA, "resources/read", { uri: "fourty://dashboard" });
    const { contents } = read!.result as { contents: { text: string }[] };
    expect(JSON.parse(contents[0].text).kpis).toBeDefined();

    const bad = await call(ctxA, "resources/read", { uri: "fourty://nope" });
    expect(bad!.error?.code).toBe(-32602);
  });

  it("serves MCP prompts (list + get)", async () => {
    const list = await call(ctxA, "prompts/list");
    const { prompts } = list!.result as { prompts: { name: string }[] };
    expect(prompts.some((p) => p.name === "draft_followup")).toBe(true);

    const get = await call(ctxA, "prompts/get", { name: "draft_followup", arguments: { contactId: "abc123" } });
    const { messages } = get!.result as { messages: { content: { text: string } }[] };
    expect(messages[0].content.text).toContain("abc123");
  });

  it("denies a viewer from the new write tools (RBAC, not a bypass door)", async () => {
    for (const [name, args] of [
      ["update_contact", { id: "x", firstName: "y" }],
      ["delete_contact", { id: "x" }],
      ["create_deal", { name: "nope" }],
      ["update_deal", { id: "x", name: "nope" }],
    ] as const) {
      const res = await callTool(viewerCtx, name, args);
      expect(res.isError, `${name} should be denied`).toBe(true);
      expect(res.data).toMatch(/Forbidden/);
    }
  });
});
