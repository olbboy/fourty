import { beforeAll, describe, expect, it } from "vitest";
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
});
