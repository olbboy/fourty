import { and, eq, ne } from "drizzle-orm";
import { db, tables } from "@/db";
import { can } from "@/lib/permissions";
import { toMcpTool } from "@/lib/actions/adapters/mcp";
import { searchCrm } from "@/lib/services/search";
import { contactsCreate, contactsDelete, contactsGet, contactsList, contactsUpdate } from "@/lib/actions/contacts";
import { companiesCreate, companiesDelete, companiesGet, companiesList, companiesUpdate } from "@/lib/actions/companies";
import { dealsCreate, dealsDelete, dealsGet, dealsList, dealsUpdate } from "@/lib/actions/deals";
import { dealStageClock } from "@/lib/actions/deals/shared";
import { pinnedWorkIds } from "@/lib/pinned-tasks";
import { tasksCreate, tasksDelete, tasksGet, tasksList, tasksUpdate } from "@/lib/actions/tasks";
import { listAssignees } from "@/lib/actions/tasks/shared";
import { notesCreate, notesList } from "@/lib/actions/notes";
import { activitiesCreate, activitiesList } from "@/lib/actions/activities";
import { factsDecide, factsList, factsRecord } from "@/lib/actions/facts";
import { dashboardStatsForRole, reportStatsForRole } from "@/lib/services/stats";
import { getPipelineWithStages, listPipelinesWithStages } from "@/lib/services/pipelines";
import { unavailable } from "@/lib/capabilities";
import {
  listObjects,
  objectByApiName,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
} from "@/lib/custom-objects";

/**
 * Fourty MCP tools (Gate B6/D, ADR-010). Each tool runs inside the caller's
 * withWorkspace() transaction (the server wraps it), so RLS scopes every query
 * and writes are RBAC-gated by can(). Tools return plain JSON — the server wraps
 * them in MCP content blocks. Reused helpers keep behavior identical to REST.
 */
// `via` records who drove the call in the audit trail: MCP passes nothing (→
// "mcp"); the in-app AI agent passes "ai". So the tool's OWN audit row is already
// correct and the agent must not fire a second audit() (RT-A).
export type ToolContext = { workspaceId: string; role: string; userId: string | null; via?: string };

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** true = the tool writes CRM data. The AI agent proposes writes (human-confirmed) and runs reads inline. */
  mutates: boolean;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

class ToolError extends Error {}

function requireRole(ctx: ToolContext, object: string, action: "read" | "create" | "update" | "delete") {
  if (!can(ctx.role, object, action)) {
    throw new ToolError(`Forbidden: ${ctx.role} cannot ${action} ${object}`);
  }
}

/** Neighbour id lists are a navigation aid, not a page — capped, never paged. */
const NEIGHBOUR_LIMIT = 25;

async function contactNeighbours(id: string) {
  const row = (
    await db.select({ companyId: tables.contacts.companyId }).from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1)
  )[0]!;
  const deals = await db
    .select({ id: tables.deals.id })
    .from(tables.deals)
    .where(eq(tables.deals.contactId, id))
    .limit(NEIGHBOUR_LIMIT);
  const colleagues = row.companyId
    ? await db
        .select({ id: tables.contacts.id })
        .from(tables.contacts)
        .where(and(eq(tables.contacts.companyId, row.companyId), ne(tables.contacts.id, id)))
        .limit(NEIGHBOUR_LIMIT)
    : [];
  return {
    companyId: row.companyId,
    dealIds: deals.map((d) => d.id),
    colleagueIds: colleagues.map((c) => c.id),
    ...(await pinnedWorkIds("contact", id)),
  };
}

async function companyNeighbours(id: string) {
  const contacts = await db
    .select({ id: tables.contacts.id })
    .from(tables.contacts)
    .where(eq(tables.contacts.companyId, id))
    .limit(NEIGHBOUR_LIMIT);
  const deals = await db
    .select({ id: tables.deals.id })
    .from(tables.deals)
    .where(eq(tables.deals.companyId, id))
    .limit(NEIGHBOUR_LIMIT);
  return {
    contactIds: contacts.map((c) => c.id),
    dealIds: deals.map((d) => d.id),
    ...(await pinnedWorkIds("company", id)),
  };
}

async function dealNeighbours(id: string) {
  const row = (
    await db
      .select({
        companyId: tables.deals.companyId,
        contactId: tables.deals.contactId,
        stageId: tables.deals.stageId,
        stageEnteredAt: tables.deals.stageEnteredAt,
      })
      .from(tables.deals)
      .where(eq(tables.deals.id, id))
      .limit(1)
  )[0]!;
  // The deal's own contact plus everyone else at its company: "who do I talk
  // to about this" is one hop, not a second search.
  const contacts = row.companyId
    ? await db
        .select({ id: tables.contacts.id })
        .from(tables.contacts)
        .where(eq(tables.contacts.companyId, row.companyId))
        .limit(NEIGHBOUR_LIMIT)
    : [];
  const contactIds = [...new Set([row.contactId, ...contacts.map((c) => c.id)].filter((v): v is string => !!v))];
  return {
    companyId: row.companyId,
    contactIds,
    stage: await dealStageClock(row),
    ...(await pinnedWorkIds("deal", id)),
  };
}

/**
 * A custom-object name that does not resolve. Two different situations, and the
 * difference matters to the caller: this workspace defines no custom objects at
 * all (nothing to retry — the capability is off), or it defines some and this is
 * the wrong name (retry with one of these). Neither throws: an agent that gets an
 * error here abandons the task, where the useful move is to pick another name or
 * say the feature is not set up.
 */
async function unknownObject(apiName: string) {
  const objects = await listObjects();
  if (objects.length === 0) return unavailable("CUSTOM_OBJECTS");
  return {
    ok: false as const,
    configured: true as const,
    reason: `No custom object named "${apiName}" in this workspace.`,
    available: objects.map((o) => o.apiName),
  };
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

export const TOOLS: Tool[] = [
  {
    name: "search",
    mutates: false,
    description:
      "Search contacts, companies, deals, and custom-object records by name, email, company domain, or record title. EXACT or PREFIX match only — this is not a fuzzy search, so a misspelling returns nothing rather than the nearest name. Surname-only and domain prefixes work. Returns the top matches per type.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search text" }, limit: { type: "number" } },
      required: ["query"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "contacts", "read");
      const q = str(args.query)?.trim();
      if (!q) return { contacts: [], companies: [], deals: [], records: [] };
      const limit = Math.min(num(args.limit, 10), 25);
      const hits = await searchCrm(q, { mode: "prefix", limit, role: ctx.role });
      const empty =
        hits.contacts.length === 0 &&
        hits.companies.length === 0 &&
        hits.deals.length === 0 &&
        hits.records.length === 0;
      return {
        ...hits,
        // Without this a caller reads "no results" as "no such person" and ends
        // the conversation, when the real cause is usually a spelling variant.
        ...(empty
          ? {
              note: `No exact or prefix match for "${q}". This search is not fuzzy — try a shorter prefix, the surname alone, or an email address.`,
            }
          : {}),
      };
    },
  },
  toMcpTool(contactsGet, {
    name: "get_contact",
    description:
      "Fetch one contact by id, plus the ids of everything adjacent to it: its company, its deals, colleagues at the same company, and pinned tasks, notes, and timeline. Use this instead of a second search to walk the graph.",
    map: async (contact, args) => ({ contact, neighbours: await contactNeighbours(String(args.id)) }),
  }),
  toMcpTool(companiesGet, {
    name: "get_company",
    description:
      "Fetch one company by id, plus the ids of its contacts, deals, and pinned tasks, notes, and timeline. Use this instead of a second search to walk the graph.",
    map: async (company, args) => ({ company, neighbours: await companyNeighbours(String(args.id)) }),
  }),
  toMcpTool(dealsGet, {
    name: "get_deal",
    description:
      "Fetch one deal by id, plus its company and contact ids, pinned task, note, and timeline ids, and its stage clock (which stage, and how long it has sat there).",
    map: async (deal, args) => ({ deal, neighbours: await dealNeighbours(String(args.id)) }),
  }),
  toMcpTool(contactsList, {
    name: "list_contacts",
    // This tool has always called the text filter `query` and returned 50 by
    // default; the action calls it `q` and returns 200.
    rename: { query: "q" },
    defaults: { limit: 50 },
    max: { limit: 200 },
  }),
  toMcpTool(contactsCreate, { name: "create_contact" }),
  toMcpTool(companiesList, {
    name: "list_companies",
    // This tool has always called the text filter `query` and returned 50 by
    // default; the action calls it `q` and returns 200.
    rename: { query: "q" },
    defaults: { limit: 50 },
    max: { limit: 200 },
  }),
  toMcpTool(companiesCreate, { name: "create_company" }),
  toMcpTool(dealsList, {
    name: "list_deals",
    // This tool has always returned 50 by default; the action returns 300.
    // `query` matches list_contacts / list_companies so an agent can filter
    // by deal name without a second search.
    rename: { query: "q" },
    defaults: { limit: 50 },
    max: { limit: 200 },
  }),
  {
    name: "get_dashboard_stats",
    mutates: false,
    description: "Return the CRM dashboard analytics (pipeline, forecast, win rate, hot leads, etc.).",
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      requireRole(ctx, "contacts", "read");
      return dashboardStatsForRole(ctx.role);
    },
  },
  {
    name: "get_report_stats",
    mutates: false,
    description: "Return CRM report analytics (source conversion, win/loss, pipeline aging, score bands).",
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      requireRole(ctx, "contacts", "read");
      return reportStatsForRole(ctx.role);
    },
  },
  {
    name: "list_pipelines",
    mutates: false,
    description: "List sales pipelines with nested stages (name, type, order, win probability).",
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      requireRole(ctx, "pipelines", "read");
      return listPipelinesWithStages();
    },
  },
  {
    name: "get_pipeline",
    mutates: false,
    description: "Fetch one sales pipeline by id, including its stages.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Pipeline id" } },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "pipelines", "read");
      const id = str(args.id);
      if (!id) throw new ToolError("id is required");
      const row = await getPipelineWithStages(id);
      if (!row) throw new ToolError("Pipeline not found");
      return row;
    },
  },
  {
    name: "list_custom_objects",
    mutates: false,
    description: "List the workspace's no-code custom object types.",
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      requireRole(ctx, "custom-objects", "read");
      return listObjects();
    },
  },
  {
    name: "list_records",
    mutates: false,
    description:
      "List records of a custom object by its api name. Optional query matches any field; sort is createdAt, updatedAt, or a field key.",
    inputSchema: {
      type: "object",
      properties: {
        object: { type: "string" },
        query: { type: "string" },
        sort: { type: "string" },
        limit: { type: "number" },
      },
      required: ["object"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "objects", "read");
      const apiName = str(args.object);
      if (!apiName) throw new ToolError("object is required");
      const obj = await objectByApiName(apiName);
      if (!obj) return await unknownObject(apiName);
      return listRecords(obj.id, {
        limit: num(args.limit, 50),
        q: str(args.query),
        sort: str(args.sort),
      });
    },
  },
  {
    name: "get_record",
    mutates: false,
    description:
      "Fetch one custom-object record by object api name and id, plus pinned task, note, and timeline ids. Use this instead of a second list to walk the graph.",
    inputSchema: {
      type: "object",
      properties: { object: { type: "string" }, id: { type: "string" } },
      required: ["object", "id"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "objects", "read");
      const apiName = str(args.object);
      const id = str(args.id);
      if (!apiName) throw new ToolError("object is required");
      if (!id) throw new ToolError("id is required");
      const obj = await objectByApiName(apiName);
      if (!obj) return await unknownObject(apiName);
      const record = await getRecord(obj.id, id);
      if (!record) throw new ToolError("Record not found");
      return { ...record, neighbours: await pinnedWorkIds(apiName, id) };
    },
  },
  {
    name: "create_record",
    mutates: true,
    description: "Create a record of a custom object. `data` is validated against the object's fields.",
    inputSchema: {
      type: "object",
      properties: { object: { type: "string" }, data: { type: "object" } },
      required: ["object", "data"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "objects", "create");
      const apiName = str(args.object);
      if (!apiName) throw new ToolError("object is required");
      const obj = await objectByApiName(apiName);
      if (!obj) return await unknownObject(apiName);
      const data = (args.data && typeof args.data === "object" ? args.data : {}) as Record<string, unknown>;
      const result = await createRecord(obj.id, data, {
        apiName: obj.apiName,
        actorId: ctx.userId,
        meta: { via: ctx.via ?? "mcp" },
      });
      if (!result.ok) throw new ToolError(result.error);
      return result.record;
    },
  },
  {
    name: "update_record",
    mutates: true,
    description: "Update a custom-object record by id. `data` is merged into the existing fields and validated.",
    inputSchema: {
      type: "object",
      properties: { object: { type: "string" }, id: { type: "string" }, data: { type: "object" } },
      required: ["object", "id", "data"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "objects", "update");
      const apiName = str(args.object);
      const id = str(args.id);
      if (!apiName) throw new ToolError("object is required");
      if (!id) throw new ToolError("id is required");
      const obj = await objectByApiName(apiName);
      if (!obj) return await unknownObject(apiName);
      const data = (args.data && typeof args.data === "object" ? args.data : {}) as Record<string, unknown>;
      const result = await updateRecord(obj.id, id, data, {
        apiName: obj.apiName,
        actorId: ctx.userId,
        meta: { via: ctx.via ?? "mcp" },
      });
      if (result === undefined) throw new ToolError("Record not found");
      if (!result.ok) throw new ToolError(result.error);
      return result.record;
    },
  },
  {
    name: "delete_record",
    mutates: true,
    description:
      "Delete a custom-object record by id. SAFE BY DEFAULT: without confirm=true this only previews what would be deleted.",
    inputSchema: {
      type: "object",
      properties: { object: { type: "string" }, id: { type: "string" }, confirm: { type: "boolean" } },
      required: ["object", "id"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "objects", "delete");
      const apiName = str(args.object);
      const id = str(args.id);
      if (!apiName) throw new ToolError("object is required");
      if (!id) throw new ToolError("id is required");
      const obj = await objectByApiName(apiName);
      if (!obj) return await unknownObject(apiName);
      const existing = await getRecord(obj.id, id);
      if (!existing) throw new ToolError("Record not found");
      if (args.confirm !== true) {
        return {
          dryRun: true,
          wouldDelete: { type: obj.apiName, id },
          hint: "Re-call with confirm=true to actually delete (also removes its notes + activities).",
        };
      }
      await deleteRecord(obj.id, id, {
        apiName: obj.apiName,
        actorId: ctx.userId,
        meta: { via: ctx.via ?? "mcp" },
      });
      return { deleted: true, type: obj.apiName, id };
    },
  },
  // The evidence ledger (ADR-018). MCP is class C: report an observation, never
  // a confidence, never a field write — even VERIFIED stays a suggestion until
  // a human accepts. The in-app chat sets via:"ai" (class A) and caps at PROBABLE.
  toMcpTool(factsRecord, { name: "record_fact" }),
  toMcpTool(factsList, { name: "list_fact_suggestions" }),
  toMcpTool(factsDecide, { name: "decide_fact" }),
  toMcpTool(contactsUpdate, { name: "update_contact" }),
  // Unlike the other surfaces, an unconfirmed call here only reports what it
  // would remove — an agent shows its work before destroying anything.
  toMcpTool(contactsDelete, { name: "delete_contact", defaults: { confirm: false } }),
  toMcpTool(companiesUpdate, { name: "update_company" }),
  toMcpTool(companiesDelete, {
    name: "delete_company",
    description:
      "Delete a company by id. SAFE BY DEFAULT: without confirm=true this only previews what would be deleted.",
    defaults: { confirm: false },
  }),
  toMcpTool(dealsCreate, { name: "create_deal" }),
  toMcpTool(dealsUpdate, { name: "update_deal" }),
  toMcpTool(dealsDelete, {
    name: "delete_deal",
    description:
      "Delete a deal by id. SAFE BY DEFAULT: without confirm=true this only previews what would be deleted.",
    defaults: { confirm: false },
  }),
  toMcpTool(tasksCreate, { name: "create_task" }),
  toMcpTool(tasksUpdate, { name: "update_task" }),
  toMcpTool(tasksDelete, {
    name: "delete_task",
    description: "Delete a task by id. SAFE BY DEFAULT: without confirm=true this only previews what would be deleted.",
    defaults: { confirm: false },
  }),
  toMcpTool(tasksGet, {
    name: "get_task",
    description:
      "Fetch one task by id, plus the record it is pinned to (entityType + entityId: contact, company, deal, or a custom-object apiName).",
    map: (task) => {
      const row = task as { entityType: string | null; entityId: string | null };
      return {
        task,
        neighbours: row.entityId ? { entityType: row.entityType, entityId: row.entityId } : null,
      };
    },
  }),
  toMcpTool(tasksList, {
    name: "list_tasks",
    description: "List tasks, newest first. Optional entity filter (entityType + entityId).",
    defaults: { state: "all", sort: "createdAt", limit: 50 },
    max: { limit: 200 },
  }),
  {
    name: "list_assignees",
    mutates: false,
    description:
      "List workspace members a task can be assigned to (id and name). Pass id as ownerId on create_task or update_task.",
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      requireRole(ctx, "tasks", "read");
      return listAssignees();
    },
  },
  toMcpTool(notesList, {
    name: "list_notes",
    description:
      "List notes on a record. Requires entityType (contact, company, deal, or a custom-object apiName) and entityId. Newest first.",
    defaults: { limit: 50 },
    max: { limit: 200 },
  }),
  toMcpTool(notesCreate, { name: "create_note" }),
  toMcpTool(activitiesList, {
    name: "list_activities",
    defaults: { limit: 50 },
    max: { limit: 200 },
  }),
  toMcpTool(activitiesCreate, { name: "log_activity" }),
];

export { ToolError };
