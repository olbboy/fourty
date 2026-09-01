import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";
import { handleMcpRequest } from "@/mcp/server";
import type { ToolContext } from "@/mcp/tools";

/**
 * The same business operation must produce the same observable side effects on
 * every write surface: the same workflow events, the same activity entries, the
 * same audit action + meta, and the same event snapshot shape.
 *
 * REST is the reference implementation — GraphQL and MCP are compared against
 * it, never the other way round.
 *
 * Events are observed the way tests/engine.test.ts does it: the queue runs
 * inline under NODE_ENV=test, so `dispatchEvent` executes the real engine. One
 * always-matching workflow is registered per event; a fired event leaves a
 * `workflow_runs` row, and the workflow's `log` action renders snapshot fields
 * into that row so the snapshot shape is observable too. No spies, no test-only
 * hooks in production code.
 *
 * Deliberate non-parity lives in tests/delete-semantics.test.ts (delete
 * semantics) and is not duplicated here.
 */
describe("side-effect parity across REST / GraphQL / MCP", () => {
  const TOKEN = "frty_surface_parity_key";
  type Surface = "rest" | "graphql" | "mcp";

  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let contactRoutes: typeof import("@/app/api/contacts/route");
  let contactIdRoutes: typeof import("@/app/api/contacts/[id]/route");
  let companyRoutes: typeof import("@/app/api/companies/route");
  let companyIdRoutes: typeof import("@/app/api/companies/[id]/route");
  let taskRoutes: typeof import("@/app/api/tasks/route");
  let taskIdRoutes: typeof import("@/app/api/tasks/[id]/route");
  let gql: typeof import("@/app/api/graphql/route");
  let ws: string;
  let mcpCtx: ToolContext;

  /** Events we register a probe workflow for. workflowId === event name. */
  const PROBED_EVENTS = ["contact.created", "contact.updated", "company.created", "company.updated", "task.completed"];

  const headers = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
  const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, { headers, ...init });
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  async function runGql(query: string, variables?: Record<string, unknown>) {
    const res = await gql.POST(req("/api/graphql", { method: "POST", body: JSON.stringify({ query, variables }) }));
    const body = (await res.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
    if (body.errors) throw new Error(`GraphQL error: ${body.errors[0].message}`);
    return body.data!;
  }

  async function callTool(name: string, args: Record<string, unknown>) {
    const res = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, mcpCtx);
    const result = res!.result as { content: { text: string }[]; isError?: boolean };
    if (result.isError) throw new Error(`MCP error: ${result.content[0].text}`);
    return JSON.parse(result.content[0].text);
  }

  // ── observation ───────────────────────────────────────────────────────────

  /** Events that actually fired for an entity, read back from workflow_runs. */
  const eventsFor = (entityId: string) =>
    withWorkspace(ws, async () =>
      (await db.select().from(tables.workflowRuns).where(eq(tables.workflowRuns.entityId, entityId)))
        .map((r) => r.workflowId)
        .sort(),
    );

  /** The rendered `log` action output per event — carries the snapshot markers. */
  const runLogFor = (entityId: string, event: string) =>
    withWorkspace(ws, async () => {
      const rows = await db
        .select()
        .from(tables.workflowRuns)
        .where(and(eq(tables.workflowRuns.entityId, entityId), eq(tables.workflowRuns.workflowId, event)));
      return rows.flatMap((r) => JSON.parse(r.log) as string[]);
    });

  const activitiesFor = (entityId: string) =>
    withWorkspace(ws, async () =>
      (await db.select().from(tables.activities).where(eq(tables.activities.entityId, entityId))).map((a) => ({
        type: a.type,
        meta: JSON.parse(a.meta) as Record<string, unknown>,
      })),
    );

  const auditFor = (objectId: string) =>
    withWorkspace(ws, async () =>
      (await db.select().from(tables.auditLog).where(eq(tables.auditLog.objectId, objectId))).map((a) => ({
        action: a.action,
        meta: JSON.parse(a.meta) as Record<string, unknown>,
      })),
    );

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    contactRoutes = await import("@/app/api/contacts/route");
    contactIdRoutes = await import("@/app/api/contacts/[id]/route");
    companyRoutes = await import("@/app/api/companies/route");
    companyIdRoutes = await import("@/app/api/companies/[id]/route");
    taskRoutes = await import("@/app/api/tasks/route");
    taskIdRoutes = await import("@/app/api/tasks/[id]/route");
    gql = await import("@/app/api/graphql/route");

    ws = await createWorkspace();
    mcpCtx = { workspaceId: ws, role: "admin", userId: null };
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "test",
      prefix: TOKEN.slice(0, 8),
      keyHash: sha256(TOKEN),
      role: "admin",
      createdAt: Date.now(),
    });

    // Probe workflows: id === event name, no conditions, one `log` action that
    // renders snapshot fields so both the event and its snapshot are observable.
    await withWorkspace(ws, () =>
      db.insert(tables.workflows).values(
        PROBED_EVENTS.map((event) => ({
          id: event,
          name: `probe ${event}`,
          enabled: 1,
          trigger: JSON.stringify({ event }),
          conditions: "[]",
          actions: JSON.stringify([{ type: "log", message: "changedFields=[{{changedFields}}]" }]),
          createdAt: Date.now(),
        })),
      ),
    );
  });

  // ── operations, one implementation per surface ────────────────────────────

  const createContact = {
    rest: async () => {
      const res = await contactRoutes.POST(
        req("/api/contacts", { method: "POST", body: JSON.stringify({ firstName: "Ada", lastName: "Lovelace" }) }),
      );
      return (await res.json()).contact.id as string;
    },
    graphql: async () => {
      const data = await runGql(`mutation($i: JSON!) { createContact(input: $i) { id } }`, {
        i: { firstName: "Ada", lastName: "Lovelace" },
      });
      return (data.createContact as { id: string }).id;
    },
    mcp: async () => (await callTool("create_contact", { firstName: "Ada", lastName: "Lovelace" })).id as string,
  } satisfies Record<Surface, () => Promise<string>>;

  const updateContact = {
    rest: async (id: string) => {
      await contactIdRoutes.PATCH(
        req(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ jobTitle: "Analyst" }) }),
        params(id),
      );
    },
    graphql: async (id: string) => {
      await runGql(`mutation($id: ID!, $i: JSON!) { updateContact(id: $id, input: $i) { id } }`, {
        id,
        i: { jobTitle: "Analyst" },
      });
    },
    mcp: async (id: string) => {
      await callTool("update_contact", { id, jobTitle: "Analyst" });
    },
  } satisfies Record<Surface, (id: string) => Promise<void>>;

  const createCompany = {
    rest: async () => {
      const res = await companyRoutes.POST(
        req("/api/companies", { method: "POST", body: JSON.stringify({ name: "Analytical Engines" }) }),
      );
      return (await res.json()).company.id as string;
    },
    graphql: async () => {
      const data = await runGql(`mutation($i: JSON!) { createCompany(input: $i) { id } }`, {
        i: { name: "Analytical Engines" },
      });
      return (data.createCompany as { id: string }).id;
    },
    mcp: async () => (await callTool("create_company", { name: "Analytical Engines" })).id as string,
  } satisfies Record<Surface, () => Promise<string>>;

  const updateCompany = {
    rest: async (id: string) => {
      await companyIdRoutes.PATCH(
        req(`/api/companies/${id}`, { method: "PATCH", body: JSON.stringify({ industry: "Computing" }) }),
        params(id),
      );
    },
    graphql: async (id: string) => {
      await runGql(`mutation($id: ID!, $i: JSON!) { updateCompany(id: $id, input: $i) { id } }`, {
        id,
        i: { industry: "Computing" },
      });
    },
    mcp: async (id: string) => {
      await callTool("update_company", { id, industry: "Computing" });
    },
  } satisfies Record<Surface, (id: string) => Promise<void>>;

  const SURFACES: Surface[] = ["rest", "graphql", "mcp"];

  // ── contact.create ────────────────────────────────────────────────────────

  describe.each(SURFACES)("contact.create via %s", (surface) => {
    let id: string;
    beforeAll(async () => {
      id = await createContact[surface]();
    });

    it("dispatches contact.created", async () => {
      expect(await eventsFor(id)).toEqual(["contact.created"]);
    });

    it("logs a created activity", async () => {
      expect((await activitiesFor(id)).map((a) => a.type)).toContain("created");
    });

    it("writes the contact.created audit entry", async () => {
      expect((await auditFor(id)).map((a) => a.action)).toContain("contact.created");
    });
  });

  // ── contact.update ────────────────────────────────────────────────────────

  describe.each(SURFACES)("contact.update via %s", (surface) => {
    let id: string;
    beforeAll(async () => {
      id = await createContact[surface]();
      await updateContact[surface](id);
    });

    it("dispatches contact.updated", async () => {
      expect(await eventsFor(id)).toContain("contact.updated");
    });

    it("puts changedFields in the event snapshot", async () => {
      expect(await runLogFor(id, "contact.updated")).toContain("changedFields=[jobTitle]");
    });

    it("logs an updated activity carrying the changed field names", async () => {
      const updated = (await activitiesFor(id)).find((a) => a.type === "updated");
      expect(updated).toBeDefined();
      expect(updated!.meta.fields).toEqual(["jobTitle"]);
    });

    it("writes the contact.updated audit entry with meta.fields", async () => {
      const entry = (await auditFor(id)).find((a) => a.action === "contact.updated");
      expect(entry).toBeDefined();
      expect(entry!.meta.fields).toEqual(["jobTitle"]);
    });

    // `via` marks a write as agent-initiated. Only MCP tags it; REST and GraphQL
    // deliberately leave it unset, and unifying the surfaces must not change that.
    it("tags meta.via only on MCP", async () => {
      const entry = (await auditFor(id)).find((a) => a.action === "contact.updated")!;
      expect(entry.meta.via).toBe(surface === "mcp" ? "mcp" : undefined);
    });
  });

  // ── contact.update that changes nothing ───────────────────────────────────

  describe.each(SURFACES)("no-op contact.update via %s", (surface) => {
    let id: string;
    beforeAll(async () => {
      id = await createContact[surface]();
      // Same value the contact already has — REST skips the activity entirely.
      const noop = { jobTitle: null };
      if (surface === "rest") {
        await contactIdRoutes.PATCH(req(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify(noop) }), params(id));
      } else if (surface === "graphql") {
        await runGql(`mutation($id: ID!, $i: JSON!) { updateContact(id: $id, input: $i) { id } }`, { id, i: noop });
      } else {
        await callTool("update_contact", { id, ...noop });
      }
    });

    it("logs no updated activity when nothing actually changed", async () => {
      expect((await activitiesFor(id)).map((a) => a.type)).not.toContain("updated");
    });
  });

  // ── company.create ────────────────────────────────────────────────────────

  describe.each(SURFACES)("company.create via %s", (surface) => {
    let id: string;
    beforeAll(async () => {
      id = await createCompany[surface]();
    });

    it("dispatches company.created", async () => {
      expect(await eventsFor(id)).toEqual(["company.created"]);
    });

    it("logs a created activity", async () => {
      expect((await activitiesFor(id)).map((a) => a.type)).toContain("created");
    });

    it("writes the company.created audit entry", async () => {
      expect((await auditFor(id)).map((a) => a.action)).toContain("company.created");
    });
  });

  // ── company.update ────────────────────────────────────────────────────────

  describe.each(SURFACES)("company.update via %s", (surface) => {
    let id: string;
    beforeAll(async () => {
      id = await createCompany[surface]();
      await updateCompany[surface](id);
    });

    it("dispatches no update event — no surface has ever had one", async () => {
      expect(await eventsFor(id)).toEqual(["company.created"]);
    });

    it("logs an updated activity carrying the changed field names", async () => {
      const updated = (await activitiesFor(id)).find((a) => a.type === "updated");
      expect(updated).toBeDefined();
      expect(updated!.meta.fields).toEqual(["industry"]);
    });

    it("writes the company.updated audit entry with meta.fields", async () => {
      const entry = (await auditFor(id)).find((a) => a.action === "company.updated");
      expect(entry).toBeDefined();
      expect(entry!.meta.fields).toEqual(["industry"]);
    });
  });

  // ── task.completed — REST only ────────────────────────────────────────────

  it("REST task completion dispatches task.completed and logs on the parent", async () => {
    const contactId = await createContact.rest();
    const created = await taskRoutes.POST(
      req("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Call Ada", entityType: "contact", entityId: contactId }) }),
    );
    const taskId = (await created.json()).task.id as string;
    await taskIdRoutes.PATCH(req(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ completed: true }) }), params(taskId));

    expect(await eventsFor(taskId)).toEqual(["task.completed"]);
    expect((await activitiesFor(contactId)).map((a) => a.type)).toContain("task_completed");
  });

  // ── every action reaches the surfaces it claims ───────────────────────────

  it("serves every action on each surface it declares", async () => {
    // An action's `expose` is a claim; the adapters record what was actually
    // wired. Without this, an action could quietly stop being reachable from a
    // surface and nothing would say so until someone asked for it there.
    const { allActions, boundActions } = await import("@/lib/actions/registry");
    // Importing these is what wires the adapters up in a running process.
    await import("@/app/api/contacts/route");
    await import("@/app/api/contacts/[id]/route");
    await import("@/app/api/companies/route");
    await import("@/app/api/companies/[id]/route");
    await import("@/app/api/deals/route");
    await import("@/app/api/deals/[id]/route");
    await import("@/app/api/tasks/route");
    await import("@/app/api/tasks/[id]/route");
    await import("@/app/api/notes/route");
    await import("@/app/api/facts/route");
    await import("@/app/api/facts/[id]/route");
    await import("@/lib/graphql/schema");
    await import("@/mcp/tools");

    const actions = allActions();
    expect(actions.length).toBeGreaterThan(0);
    for (const surface of ["rest", "graphql", "mcp", "ai"] as const) {
      const claimed = actions.filter((a) => a.expose[surface]).map((a) => a.name);
      const served = boundActions(surface);
      for (const name of claimed) {
        expect(served, `${name} declares ${surface} but no ${surface} adapter serves it`).toContain(name);
      }
    }
  });

  it("GraphQL task completion dispatches task.completed and logs on the parent", async () => {
    const contactId = await createContact.graphql();
    const data = await runGql(`mutation($i: JSON!) { createTask(input: $i) { id } }`, {
      i: { title: "Call Ada", entityType: "contact", entityId: contactId },
    });
    const taskId = (data.createTask as { id: string }).id;
    await runGql(`mutation($id: ID!, $i: JSON!) { updateTask(id: $id, input: $i) { completedAt } }`, {
      id: taskId,
      i: { completed: true },
    });
    expect(await eventsFor(taskId)).toEqual(["task.completed"]);
    expect((await activitiesFor(contactId)).map((a) => a.type)).toContain("task_completed");
  });

  it("MCP task completion dispatches task.completed and logs on the parent", async () => {
    const contactId = await createContact.mcp();
    const created = await callTool("create_task", { title: "Call Ada", entityType: "contact", entityId: contactId });
    await callTool("update_task", { id: created.id, completed: true });
    expect(await eventsFor(created.id as string)).toEqual(["task.completed"]);
    expect((await activitiesFor(contactId)).map((a) => a.type)).toContain("task_completed");
  });
});
