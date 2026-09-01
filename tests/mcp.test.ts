import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";
import { handleMcpRequest, MCP_PROTOCOL_VERSION } from "@/mcp/server";
import { TOOLS, type ToolContext } from "@/mcp/tools";

/**
 * Fourty MCP server (Gate B6/D) driven through handleMcpRequest against real
 * Postgres + RLS: protocol handshake, tool listing, tool calls (read + write),
 * RBAC (viewer denied writes), custom-object records, and cross-workspace
 * isolation. The stdio transport just authenticates + pipes this handler; HTTP
 * POST /api/mcp is the same handler behind Bearer auth (and JSON-RPC batches).
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
    const { tools } = res!.result as { tools: { name: string; description: string; inputSchema: unknown }[] };
    const names = tools.map((t) => t.name);
    expect(names).toEqual(TOOLS.map((t) => t.name));
    expect(new Set(names).size).toBe(names.length);
    expect(tools.every((t) => typeof t.inputSchema === "object" && typeof t.description === "string")).toBe(true);
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

  it("search matches a surname prefix and a company domain", async () => {
    const { withWorkspace } = await import("@/db");
    await withWorkspace(ctxA.workspaceId, async () => {
      await db.insert(tables.companies).values({
        id: newId(),
        name: "Navy Labs",
        domain: "navy.mil",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const bySurname = await callTool(ctxA, "search", { query: "Hopper" });
    expect(bySurname.data.contacts.some((c: { lastName: string }) => c.lastName === "Hopper")).toBe(true);
    const byDomain = await callTool(ctxA, "search", { query: "navy.mil" });
    expect(byDomain.data.companies.some((c: { domain?: string }) => c.domain === "navy.mil")).toBe(true);
  });

  it("lists pipelines with nested stages", async () => {
    const listed = await callTool(ctxA, "list_pipelines", {});
    expect(listed.isError).toBe(false);
    expect(Array.isArray(listed.data)).toBe(true);
    expect(listed.data.length).toBeGreaterThan(0);
    expect(listed.data[0].stages.length).toBeGreaterThan(0);
    const got = await callTool(ctxA, "get_pipeline", { id: listed.data[0].id });
    expect(got.isError).toBe(false);
    expect(got.data.id).toBe(listed.data[0].id);
    const missing = await callTool(ctxA, "get_pipeline", { id: "no-such-pipeline" });
    expect(missing.isError).toBe(true);
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
    const createdTypes = await withWorkspace(ctxA.workspaceId, async () =>
      (await db.select().from(tables.activities).where(eq(tables.activities.entityId, created.data.id))).map((a) => a.type),
    );
    expect(createdTypes).toContain("created");

    const bad = await callTool(ctxA, "create_record", { object: "asset", data: {} });
    expect(bad.isError).toBe(true); // missing required field

    const records = await callTool(ctxA, "list_records", { object: "asset" });
    expect(records.data.length).toBe(1);

    const extra = await callTool(ctxA, "create_record", { object: "asset", data: { tag: "monitor-09" } });
    expect(extra.isError).toBe(false);
    const filtered = await callTool(ctxA, "list_records", { object: "asset", query: "laptop", sort: "tag" });
    expect(filtered.isError).toBe(false);
    expect((filtered.data as { data: { tag: string } }[]).map((r) => r.data.tag)).toEqual(["laptop-01"]);
    await callTool(ctxA, "delete_record", { object: "asset", id: extra.data.id, confirm: true });

    const got = await callTool(ctxA, "get_record", { object: "asset", id: created.data.id });
    expect(got.isError).toBe(false);
    expect(got.data.data.tag).toBe("laptop-01");
    expect(got.data.neighbours.taskIds).toEqual([]);
    expect(got.data.neighbours.noteIds).toEqual([]);
    expect(got.data.neighbours.activityIds.length).toBeGreaterThan(0);

    const pinned = await callTool(ctxA, "create_task", {
      title: "Tag asset",
      entityType: "asset",
      entityId: created.data.id,
    });
    expect(pinned.isError).toBe(false);
    const noted = await callTool(ctxA, "create_note", {
      body: "On the asset",
      entityType: "asset",
      entityId: created.data.id,
    });
    expect(noted.isError).toBe(false);
    const gotPinned = await callTool(ctxA, "get_record", { object: "asset", id: created.data.id });
    expect(gotPinned.data.neighbours.taskIds).toEqual([pinned.data.id]);
    expect(gotPinned.data.neighbours.noteIds).toEqual([noted.data.id]);
    expect(gotPinned.data.neighbours.activityIds).toContain(got.data.neighbours.activityIds[0]);

    const updated = await callTool(ctxA, "update_record", {
      object: "asset",
      id: created.data.id,
      data: { tag: "laptop-02" },
    });
    expect(updated.isError).toBe(false);
    expect(updated.data.data.tag).toBe("laptop-02");
    const updatedTypes = await withWorkspace(ctxA.workspaceId, async () =>
      (await db.select().from(tables.activities).where(eq(tables.activities.entityId, created.data.id))).map((a) => a.type),
    );
    expect(updatedTypes).toContain("updated");

    const dry = await callTool(ctxA, "delete_record", { object: "asset", id: created.data.id });
    expect(dry.data.dryRun).toBe(true);
    const del = await callTool(ctxA, "delete_record", { object: "asset", id: created.data.id, confirm: true });
    expect(del.data.deleted).toBe(true);
    const gone = await callTool(ctxA, "list_records", { object: "asset" });
    expect(gone.data.length).toBe(0);
    const missing = await callTool(ctxA, "get_record", { object: "asset", id: created.data.id });
    expect(missing.isError).toBe(true);
  });

  it("confines tool results to the caller's workspace (RLS)", async () => {
    const asB = await callTool(ctxB, "search", { query: "grace" });
    expect(asB.data.contacts.length).toBe(0);
    // The asset object belongs to workspace A, so B cannot see it — and since B
    // defines no custom objects at all, the tool declines structurally instead of
    // throwing (Phase 0). Either way no record and no object name crosses over.
    const objB = await callTool(ctxB, "list_records", { object: "asset" });
    expect(objB.isError).toBe(false);
    expect(objB.data.ok).toBe(false);
    expect(objB.data.capability).toBe("CUSTOM_OBJECTS");
    expect(Array.isArray(objB.data)).toBe(false);
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

    const listed = await callTool(ctxA, "list_deals", { query: "MCP Deal" });
    expect(listed.isError).toBe(false);
    expect(listed.data.some((d: { id: string }) => d.id === deal.data.id)).toBe(true);
    const miss = await callTool(ctxA, "list_deals", { query: "no-such-deal" });
    expect(miss.data.some((d: { id: string }) => d.id === deal.data.id)).toBe(false);

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
    const ghost = await callTool(ctxA, "create_task", { title: "Ghost", ownerId: "not-a-member" });
    expect(ghost.isError).toBe(true);

    const got = await callTool(ctxA, "get_task", { id: t.data.id });
    expect(got.isError).toBe(false);
    expect(got.data.task.title).toBe("Call Ada");
    expect(got.data.neighbours).toBeNull();

    const contact = await callTool(ctxA, "create_contact", { firstName: "Note", lastName: "Target" });
    const n = await callTool(ctxA, "create_note", { body: "hello", entityType: "contact", entityId: contact.data.id });
    expect(n.isError).toBe(false);
    expect(n.data.body).toBe("hello");
    const listed = await callTool(ctxA, "list_notes", {
      entityType: "contact",
      entityId: contact.data.id,
    });
    expect(listed.data.some((note: { body: string }) => note.body === "hello")).toBe(true);

    const linked = await callTool(ctxA, "create_task", {
      title: "Linked",
      entityType: "contact",
      entityId: contact.data.id,
    });
    const linkedGot = await callTool(ctxA, "get_task", { id: linked.data.id });
    expect(linkedGot.data.neighbours).toEqual({ entityType: "contact", entityId: contact.data.id });

    const tasks = await callTool(ctxA, "list_tasks", {});
    expect(Array.isArray(tasks.data)).toBe(true);
    expect(tasks.data.some((x: { title: string }) => x.title === "Call Ada")).toBe(true);

    const done = await callTool(ctxA, "update_task", { id: t.data.id, completed: true });
    expect(done.isError).toBe(false);
    expect(done.data.completedAt).toBeGreaterThan(0);

    const dry = await callTool(ctxA, "delete_task", { id: t.data.id });
    expect(dry.data.dryRun).toBe(true);
    const del = await callTool(ctxA, "delete_task", { id: t.data.id, confirm: true });
    expect(del.data.deleted).toBe(true);
    const missing = await callTool(ctxA, "get_task", { id: t.data.id });
    expect(missing.isError).toBe(true);
  });

  it("log_activity and list_activities round-trip on a record", async () => {
    const contact = await callTool(ctxA, "create_contact", { firstName: "Call", lastName: "Target" });
    expect(contact.isError).toBe(false);
    const contactId = contact.data.id as string;

    const logged = await callTool(ctxA, "log_activity", {
      type: "call",
      entityType: "contact",
      entityId: contactId,
      note: "Intro call",
    });
    expect(logged.isError).toBe(false);
    expect(logged.data.type).toBe("call");
    expect(logged.data.meta).toEqual({ note: "Intro call" });

    const listed = await callTool(ctxA, "list_activities", { entityType: "contact", entityId: contactId });
    expect(listed.isError).toBe(false);
    expect(listed.data.some((a: { type: string; meta: { note?: string } }) => a.type === "call" && a.meta.note === "Intro call")).toBe(
      true,
    );
    expect(listed.data.some((a: { type: string }) => a.type === "created")).toBe(true);

    const unscoped = await callTool(ctxA, "list_activities", {});
    expect(unscoped.data).toEqual([]);

    const denied = await callTool(viewerCtx, "log_activity", {
      type: "meeting",
      entityType: "contact",
      entityId: contactId,
    });
    expect(denied.isError).toBe(true);
  });

  it("record_fact, list_fact_suggestions, and decide_fact round-trip", async () => {
    const contact = await callTool(ctxA, "create_contact", { firstName: "Fact", lastName: "Target" });
    expect(contact.isError).toBe(false);
    const contactId = contact.data.id as string;

    // A lone signature is PROBABLE — a suggestion, never a write (ADR-018).
    const proposed = await callTool(ctxA, "record_fact", {
      entityType: "contact",
      entityId: contactId,
      field: "job_title",
      value: "Head of Ops",
      evidence: [{ kind: "crm.signature-block", detail: "their signature on 14 July reads Head of Ops" }],
    });
    expect(proposed.isError).toBe(false);
    expect(proposed.data.ok).toBe(true);
    expect(proposed.data.applied).toBe(false);
    expect(proposed.data.fact.band).toBe("PROBABLE");
    const factId = proposed.data.fact.id as string;

    const listed = await callTool(ctxA, "list_fact_suggestions", {
      entityType: "contact",
      entityId: contactId,
    });
    expect(listed.isError).toBe(false);
    expect(listed.data.some((f: { id: string }) => f.id === factId)).toBe(true);

    // MCP is class C: even VERIFIED evidence must not write the field. Only a
    // deterministic research pass (class B) applies, and a human commits by
    // accepting — which is the next call.
    const verified = await callTool(ctxA, "record_fact", {
      entityType: "contact",
      entityId: contactId,
      field: "linkedin",
      value: "https://linkedin.com/in/fact-target",
      evidence: [
        { kind: "crm.signature-block", detail: "signature lists this profile" },
        { kind: "profile.email-match", detail: "replied from their own address" },
      ],
    });
    expect(verified.isError).toBe(false);
    expect(verified.data.ok).toBe(true);
    expect(verified.data.applied).toBe(false);
    expect(verified.data.fact.band).toBe("VERIFIED");

    const decided = await callTool(ctxA, "decide_fact", { id: factId, decision: "accept" });
    expect(decided.isError).toBe(false);
    expect(decided.data.ok).toBe(true);
    expect(decided.data.fact.status).toBe("APPLIED");

    const after = await callTool(ctxA, "get_contact", { id: contactId });
    expect(after.data.contact.jobTitle).toBe("Head of Ops");
    expect(after.data.contact.linkedin).toBeFalsy();
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
      ["record_fact", { entityType: "contact", entityId: "x", field: "job_title", value: "nope", evidence: [{ kind: "crm.signature-block", detail: "nope" }] }],
      ["decide_fact", { id: "x", decision: "accept" }],
    ] as const) {
      const res = await callTool(viewerCtx, name, args);
      expect(res.isError, `${name} should be denied`).toBe(true);
      expect(res.data).toMatch(/Forbidden/);
    }
  });

  describe("HTTP POST /api/mcp", () => {
    const ADMIN = "frty_mcp_http_admin";
    const VIEWER = "frty_mcp_http_viewer";
    let mcpHttp: typeof import("@/app/api/mcp/route");

    const post = (token: string | null, body: unknown) =>
      mcpHttp.POST(
        new Request("http://localhost/api/mcp", {
          method: "POST",
          headers: token
            ? { Authorization: `Bearer ${token}`, "content-type": "application/json" }
            : { "content-type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
      );

    beforeAll(async () => {
      const { sha256 } = await import("@/lib/auth");
      mcpHttp = await import("@/app/api/mcp/route");
      await db.insert(tables.apiKeys).values([
        {
          id: newId(),
          workspaceId: ctxA.workspaceId,
          name: "http",
          prefix: ADMIN.slice(0, 8),
          keyHash: sha256(ADMIN),
          role: "admin",
          createdAt: Date.now(),
        },
        {
          id: newId(),
          workspaceId: ctxA.workspaceId,
          name: "http-v",
          prefix: VIEWER.slice(0, 8),
          keyHash: sha256(VIEWER),
          role: "viewer",
          createdAt: Date.now(),
        },
      ]);
    });

    it("refuses an invalid key", async () => {
      const res = await post("frty_bogus", { jsonrpc: "2.0", id: 1, method: "initialize" });
      expect(res.status).toBe(401);
    });

    it("initializes and calls a tool over HTTP", async () => {
      const init = await post(ADMIN, { jsonrpc: "2.0", id: 1, method: "initialize" });
      expect(init.status).toBe(200);
      expect((await init.json()).result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);

      const created = await post(ADMIN, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "create_contact", arguments: { firstName: "Http", lastName: "Mcp" } },
      });
      expect(created.status).toBe(200);
      const body = await created.json();
      expect(body.result.isError).toBeFalsy();
      expect(JSON.parse(body.result.content[0].text).firstName).toBe("Http");
    });

    it("accepts a JSON-RPC batch", async () => {
      const res = await post(ADMIN, [
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[1].result.tools.some((t: { name: string }) => t.name === "record_fact")).toBe(true);
    });

    it("returns a JSON-RPC parse error on invalid JSON", async () => {
      const res = await post(ADMIN, "{not json");
      expect(res.status).toBe(200);
      expect((await res.json()).error.code).toBe(-32700);
    });

    it("answers a notification with 202 and no body", async () => {
      const res = await post(ADMIN, { jsonrpc: "2.0", method: "notifications/initialized" });
      expect(res.status).toBe(202);
      expect(await res.text()).toBe("");
    });

    it("denies a viewer write over HTTP", async () => {
      const res = await post(VIEWER, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_contact", arguments: { firstName: "Nope" } },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toMatch(/Forbidden/);
    });
  });
});
