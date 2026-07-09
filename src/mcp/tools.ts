import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { can } from "@/lib/permissions";
import { loadFieldPolicy, redact, blockedWrites, type FieldPolicy } from "@/lib/field-permissions";
import { audit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { recomputeDealScore } from "@/lib/services/deal-score";
import {
  contactInput,
  contactPatch,
  companyInput,
  companyPatch,
  dealInput,
  dealPatch,
  taskInput,
  noteInput,
} from "@/lib/validators";
import { computeDashboardStats } from "@/lib/services/stats";
import { dispatchEvent } from "@/lib/workflows/engine";
import { ensureDefaultPipeline } from "@/db/seed";
import {
  listObjects,
  objectByApiName,
  listRecords,
  createRecord,
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

// Field-level permissions (Gate D1, ADR-011): the same policy REST/GraphQL apply,
// so MCP is not a bypass door. Unreadable fields are stripped from tool output;
// a write to a non-writable field is refused.
async function requireWritableFields(
  ctx: ToolContext,
  object: string,
  args: Record<string, unknown>,
): Promise<FieldPolicy | null> {
  const policy = await loadFieldPolicy(ctx.role);
  const blocked = blockedWrites(policy, object, Object.keys(args));
  if (blocked.length) throw new ToolError(`Forbidden: cannot write ${object} field(s): ${blocked.join(", ")}`);
  return policy;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

export const TOOLS: Tool[] = [
  {
    name: "search",
    mutates: false,
    description: "Search contacts, companies, and deals by name/email. Returns the top matches per type.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search text" }, limit: { type: "number" } },
      required: ["query"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "contacts", "read");
      const q = str(args.query)?.trim();
      if (!q) return { contacts: [], companies: [], deals: [] };
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const limit = Math.min(num(args.limit, 10), 25);
      const contacts = await db
        .select({ id: tables.contacts.id, firstName: tables.contacts.firstName, lastName: tables.contacts.lastName, email: tables.contacts.email })
        .from(tables.contacts)
        .where(
          or(
            ilike(sql`${tables.contacts.firstName} || ' ' || ${tables.contacts.lastName}`, like),
            ilike(tables.contacts.email, like),
          ),
        )
        .limit(limit);
      const companies = await db
        .select({ id: tables.companies.id, name: tables.companies.name })
        .from(tables.companies)
        .where(ilike(tables.companies.name, like))
        .limit(limit);
      const deals = await db
        .select({ id: tables.deals.id, name: tables.deals.name, amount: tables.deals.amount })
        .from(tables.deals)
        .where(ilike(tables.deals.name, like))
        .limit(limit);
      const policy = await loadFieldPolicy(ctx.role);
      return {
        contacts: contacts.map((r) => redact(policy, "contacts", r)),
        companies: companies.map((r) => redact(policy, "companies", r)),
        deals: deals.map((r) => redact(policy, "deals", r)),
      };
    },
  },
  {
    name: "list_contacts",
    mutates: false,
    description: "List contacts, most recently updated first. Optional text filter.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "contacts", "read");
      const q = str(args.query)?.trim();
      const where: SQL[] = [];
      if (q) {
        const like = `%${q.replace(/[%_]/g, "")}%`;
        where.push(or(ilike(sql`${tables.contacts.firstName} || ' ' || ${tables.contacts.lastName}`, like), ilike(tables.contacts.email, like))!);
      }
      const rows = await db
        .select()
        .from(tables.contacts)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(tables.contacts.updatedAt))
        .limit(Math.min(num(args.limit, 50), 200));
      const policy = await loadFieldPolicy(ctx.role);
      return rows.map((r) => redact(policy, "contacts", { ...r, custom: JSON.parse(r.custom) }));
    },
  },
  {
    name: "create_contact",
    mutates: true,
    description: "Create a contact. Requires firstName; email/phone/jobTitle/companyId/status optional.",
    inputSchema: {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        jobTitle: { type: "string" },
        companyId: { type: "string" },
        status: { type: "string", enum: ["lead", "qualified", "customer", "churned"] },
      },
      required: ["firstName"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "contacts", "create");
      const policy = await requireWritableFields(ctx, "contacts", args);
      const parsed = contactInput.safeParse(args);
      if (!parsed.success) throw new ToolError(parsed.error.issues[0].message);
      const now = Date.now();
      const id = newId();
      const { custom, ...fields } = parsed.data;
      await db.insert(tables.contacts).values({
        id,
        ...fields,
        ownerId: ctx.userId,
        custom: JSON.stringify(custom ?? {}),
        createdAt: now,
        updatedAt: now,
      });
      await logActivity({ type: "created", entityType: "contact", entityId: id, actorId: ctx.userId });
      await audit(ctx.userId, "contact.created", { objectType: "contact", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      await recomputeContactScore(id);
      const row = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0]!;
      return redact(policy, "contacts", { ...row, custom: JSON.parse(row.custom) });
    },
  },
  {
    name: "list_companies",
    mutates: false,
    description: "List companies, most recently updated first. Optional text filter.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } },
    handler: async (args, ctx) => {
      requireRole(ctx, "companies", "read");
      const q = str(args.query)?.trim();
      const rows = await db
        .select()
        .from(tables.companies)
        .where(q ? ilike(tables.companies.name, `%${q.replace(/[%_]/g, "")}%`) : undefined)
        .orderBy(desc(tables.companies.updatedAt))
        .limit(Math.min(num(args.limit, 50), 200));
      const policy = await loadFieldPolicy(ctx.role);
      return rows.map((r) => redact(policy, "companies", { ...r, custom: JSON.parse(r.custom) }));
    },
  },
  {
    name: "create_company",
    mutates: true,
    description: "Create a company. Requires name.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, domain: { type: "string" }, industry: { type: "string" } },
      required: ["name"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "companies", "create");
      const policy = await requireWritableFields(ctx, "companies", args);
      const parsed = companyInput.safeParse(args);
      if (!parsed.success) throw new ToolError(parsed.error.issues[0].message);
      const now = Date.now();
      const id = newId();
      const { custom, ...fields } = parsed.data;
      await db.insert(tables.companies).values({
        id,
        ...fields,
        ownerId: ctx.userId,
        custom: JSON.stringify(custom ?? {}),
        createdAt: now,
        updatedAt: now,
      });
      await audit(ctx.userId, "company.created", { objectType: "company", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      const row = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0]!;
      return redact(policy, "companies", { ...row, custom: JSON.parse(row.custom) });
    },
  },
  {
    name: "list_deals",
    mutates: false,
    description: "List deals, most recently updated first.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (args, ctx) => {
      requireRole(ctx, "deals", "read");
      const rows = await db
        .select()
        .from(tables.deals)
        .orderBy(desc(tables.deals.updatedAt))
        .limit(Math.min(num(args.limit, 50), 200));
      const policy = await loadFieldPolicy(ctx.role);
      return rows.map((r) => redact(policy, "deals", { ...r, custom: JSON.parse(r.custom) }));
    },
  },
  {
    name: "get_dashboard_stats",
    mutates: false,
    description: "Return the CRM dashboard analytics (pipeline, forecast, win rate, hot leads, etc.).",
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      requireRole(ctx, "contacts", "read");
      return computeDashboardStats();
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
    description: "List records of a custom object by its api name.",
    inputSchema: {
      type: "object",
      properties: { object: { type: "string" }, limit: { type: "number" } },
      required: ["object"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "objects", "read");
      const apiName = str(args.object);
      if (!apiName) throw new ToolError("object is required");
      const obj = await objectByApiName(apiName);
      if (!obj) throw new ToolError(`Unknown object: ${apiName}`);
      return listRecords(obj.id, num(args.limit, 50));
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
      if (!obj) throw new ToolError(`Unknown object: ${apiName}`);
      const data = (args.data && typeof args.data === "object" ? args.data : {}) as Record<string, unknown>;
      const result = await createRecord(obj.id, data);
      if (!result.ok) throw new ToolError(result.error);
      await audit(ctx.userId, "record.created", { objectType: obj.apiName, objectId: result.record.id, meta: { via: ctx.via ?? "mcp" } });
      return result.record;
    },
  },
  {
    name: "update_contact",
    mutates: true,
    description: "Update a contact by id. Only the fields you pass change.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        jobTitle: { type: "string" },
        companyId: { type: "string" },
        status: { type: "string", enum: ["lead", "qualified", "customer", "churned"] },
        source: { type: "string" },
      },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "contacts", "update");
      const id = str(args.id);
      if (!id) throw new ToolError("id is required");
      const rest: Record<string, unknown> = { ...args };
      delete rest.id;
      const policy = await requireWritableFields(ctx, "contacts", rest);
      const parsed = contactPatch.safeParse(rest);
      if (!parsed.success) throw new ToolError(parsed.error.issues[0].message);
      const existing = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0];
      if (!existing) throw new ToolError("Contact not found");
      const { custom, ...fields } = parsed.data;
      await db
        .update(tables.contacts)
        .set({
          ...fields,
          ...(custom !== undefined
            ? { custom: JSON.stringify({ ...JSON.parse(existing.custom), ...custom }) }
            : {}),
          updatedAt: Date.now(),
        })
        .where(eq(tables.contacts.id, id));
      await logActivity({ type: "updated", entityType: "contact", entityId: id, actorId: ctx.userId });
      await audit(ctx.userId, "contact.updated", { objectType: "contact", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      await recomputeContactScore(id);
      const row = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0]!;
      return redact(policy, "contacts", { ...row, custom: JSON.parse(row.custom) });
    },
  },
  {
    name: "delete_contact",
    mutates: true,
    description:
      "Delete a contact by id. SAFE BY DEFAULT: without confirm=true this only previews what would be deleted.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, confirm: { type: "boolean" } },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "contacts", "delete");
      const id = str(args.id);
      if (!id) throw new ToolError("id is required");
      const existing = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0];
      if (!existing) throw new ToolError("Contact not found");
      if (args.confirm !== true) {
        return {
          dryRun: true,
          wouldDelete: { type: "contact", id, name: `${existing.firstName} ${existing.lastName}`.trim() },
          hint: "Re-call with confirm=true to actually delete (also removes its notes + activities).",
        };
      }
      await db.delete(tables.contacts).where(eq(tables.contacts.id, id));
      await db.delete(tables.notes).where(eq(tables.notes.entityId, id));
      await db.delete(tables.activities).where(eq(tables.activities.entityId, id));
      await audit(ctx.userId, "contact.deleted", { objectType: "contact", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      return { deleted: true, type: "contact", id };
    },
  },
  {
    name: "update_company",
    mutates: true,
    description: "Update a company by id. Only the fields you pass change.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        domain: { type: "string" },
        industry: { type: "string" },
        size: { type: "string" },
      },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "companies", "update");
      const id = str(args.id);
      if (!id) throw new ToolError("id is required");
      const rest: Record<string, unknown> = { ...args };
      delete rest.id;
      const policy = await requireWritableFields(ctx, "companies", rest);
      const parsed = companyPatch.safeParse(rest);
      if (!parsed.success) throw new ToolError(parsed.error.issues[0].message);
      const existing = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0];
      if (!existing) throw new ToolError("Company not found");
      const { custom, ...fields } = parsed.data;
      await db
        .update(tables.companies)
        .set({
          ...fields,
          ...(custom !== undefined
            ? { custom: JSON.stringify({ ...JSON.parse(existing.custom), ...custom }) }
            : {}),
          updatedAt: Date.now(),
        })
        .where(eq(tables.companies.id, id));
      await audit(ctx.userId, "company.updated", { objectType: "company", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      const row = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0]!;
      return redact(policy, "companies", { ...row, custom: JSON.parse(row.custom) });
    },
  },
  {
    name: "delete_company",
    mutates: true,
    description:
      "Delete a company by id. SAFE BY DEFAULT: without confirm=true this only previews what would be deleted.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, confirm: { type: "boolean" } },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "companies", "delete");
      const id = str(args.id);
      if (!id) throw new ToolError("id is required");
      const existing = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0];
      if (!existing) throw new ToolError("Company not found");
      if (args.confirm !== true) {
        return {
          dryRun: true,
          wouldDelete: { type: "company", id, name: existing.name },
          hint: "Re-call with confirm=true to delete (contacts/deals are detached, not deleted).",
        };
      }
      await db.delete(tables.companies).where(eq(tables.companies.id, id));
      await db.update(tables.contacts).set({ companyId: null }).where(eq(tables.contacts.companyId, id));
      await db.update(tables.deals).set({ companyId: null }).where(eq(tables.deals.companyId, id));
      await db.delete(tables.notes).where(eq(tables.notes.entityId, id));
      await db.delete(tables.activities).where(eq(tables.activities.entityId, id));
      await audit(ctx.userId, "company.deleted", { objectType: "company", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      return { deleted: true, type: "company", id };
    },
  },
  {
    name: "create_deal",
    mutates: true,
    description:
      "Create a deal. Requires name. Uses the default pipeline's first stage unless stageId is given. Returns the deal with its computed health score.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string" },
        pipelineId: { type: "string" },
        stageId: { type: "string" },
        companyId: { type: "string" },
        contactId: { type: "string" },
        expectedCloseDate: { type: "number" },
      },
      required: ["name"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "deals", "create");
      const policy = await requireWritableFields(ctx, "deals", args);
      const parsed = dealInput.safeParse(args);
      if (!parsed.success) throw new ToolError(parsed.error.issues[0].message);
      const pipelineId = parsed.data.pipelineId ?? (await ensureDefaultPipeline());
      let stageId = parsed.data.stageId;
      if (!stageId) {
        const first = (
          await db
            .select()
            .from(tables.stages)
            .where(eq(tables.stages.pipelineId, pipelineId))
            .orderBy(tables.stages.order)
            .limit(1)
        )[0];
        if (!first) throw new ToolError("Pipeline has no stages");
        stageId = first.id;
      } else {
        const stage = (await db.select().from(tables.stages).where(eq(tables.stages.id, stageId)).limit(1))[0];
        if (!stage || stage.pipelineId !== pipelineId) throw new ToolError("Invalid stage for pipeline");
      }
      const now = Date.now();
      const id = newId();
      const { custom, ...fields } = parsed.data;
      await db.insert(tables.deals).values({
        id,
        ...fields,
        pipelineId,
        stageId,
        ownerId: ctx.userId,
        stageEnteredAt: now,
        custom: JSON.stringify(custom ?? {}),
        createdAt: now,
        updatedAt: now,
      });
      await logActivity({ type: "created", entityType: "deal", entityId: id, actorId: ctx.userId });
      await audit(ctx.userId, "deal.created", { objectType: "deal", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      await recomputeDealScore(id);
      const row = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0]!;
      await dispatchEvent({ event: "deal.created", entityType: "deal", entityId: id, snapshot: { ...row, custom: undefined } });
      return redact(policy, "deals", { ...row, custom: JSON.parse(row.custom) });
    },
  },
  {
    name: "update_deal",
    mutates: true,
    description:
      "Update a deal by id. Pass stageId to move it along the pipeline (fires won/lost workflows). Recomputes the health score.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string" },
        stageId: { type: "string" },
        companyId: { type: "string" },
        contactId: { type: "string" },
        expectedCloseDate: { type: "number" },
      },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "deals", "update");
      const id = str(args.id);
      if (!id) throw new ToolError("id is required");
      const rest: Record<string, unknown> = { ...args };
      delete rest.id;
      const policy = await requireWritableFields(ctx, "deals", rest);
      const parsed = dealPatch.safeParse(rest);
      if (!parsed.success) throw new ToolError(parsed.error.issues[0].message);
      const existing = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
      if (!existing) throw new ToolError("Deal not found");
      const { custom, stageId, pipelineId: _pipe, ...fields } = parsed.data;
      void _pipe; // deals cannot move between pipelines here

      const now = Date.now();
      const stageChanged = stageId !== undefined && stageId !== existing.stageId;
      let newStage = null;
      if (stageChanged) {
        newStage = (await db.select().from(tables.stages).where(eq(tables.stages.id, stageId!)).limit(1))[0];
        if (!newStage || newStage.pipelineId !== existing.pipelineId) throw new ToolError("Invalid stage");
      }
      await db
        .update(tables.deals)
        .set({
          ...fields,
          ...(stageChanged
            ? { stageId: stageId!, stageEnteredAt: now, closedAt: newStage!.type === "open" ? null : now }
            : {}),
          ...(custom !== undefined
            ? { custom: JSON.stringify({ ...JSON.parse(existing.custom), ...custom }) }
            : {}),
          updatedAt: now,
        })
        .where(eq(tables.deals.id, id));
      const mid = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0]!;
      const snapshot = { ...mid, custom: undefined, stageName: newStage?.name };
      if (stageChanged) {
        await logActivity({ type: "stage_changed", entityType: "deal", entityId: id, actorId: ctx.userId, meta: { to: newStage!.name } });
        await dispatchEvent({ event: "deal.stage_changed", entityType: "deal", entityId: id, snapshot });
        if (newStage!.type === "won") await dispatchEvent({ event: "deal.won", entityType: "deal", entityId: id, snapshot });
        else if (newStage!.type === "lost") await dispatchEvent({ event: "deal.lost", entityType: "deal", entityId: id, snapshot });
      }
      await audit(ctx.userId, "deal.updated", { objectType: "deal", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      await recomputeDealScore(id);
      const row = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0]!;
      return redact(policy, "deals", { ...row, custom: JSON.parse(row.custom) });
    },
  },
  {
    name: "delete_deal",
    mutates: true,
    description:
      "Delete a deal by id. SAFE BY DEFAULT: without confirm=true this only previews what would be deleted.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, confirm: { type: "boolean" } },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "deals", "delete");
      const id = str(args.id);
      if (!id) throw new ToolError("id is required");
      const existing = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
      if (!existing) throw new ToolError("Deal not found");
      if (args.confirm !== true) {
        return {
          dryRun: true,
          wouldDelete: { type: "deal", id, name: existing.name, amount: existing.amount },
          hint: "Re-call with confirm=true to actually delete (also removes its notes + activities).",
        };
      }
      await db.delete(tables.deals).where(eq(tables.deals.id, id));
      await db.delete(tables.notes).where(eq(tables.notes.entityId, id));
      await db.delete(tables.activities).where(eq(tables.activities.entityId, id));
      await audit(ctx.userId, "deal.deleted", { objectType: "deal", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      return { deleted: true, type: "deal", id };
    },
  },
  {
    name: "create_task",
    mutates: true,
    description: "Create a task. Requires title. Optionally link it to a contact/company/deal.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        dueDate: { type: "number" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        entityType: { type: "string", enum: ["contact", "company", "deal"] },
        entityId: { type: "string" },
      },
      required: ["title"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "tasks", "create");
      const parsed = taskInput.safeParse(args);
      if (!parsed.success) throw new ToolError(parsed.error.issues[0].message);
      const now = Date.now();
      const id = newId();
      await db.insert(tables.tasks).values({ id, ...parsed.data, ownerId: ctx.userId, createdAt: now });
      await audit(ctx.userId, "task.created", { objectType: "task", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      return (await db.select().from(tables.tasks).where(eq(tables.tasks.id, id)).limit(1))[0]!;
    },
  },
  {
    name: "list_tasks",
    mutates: false,
    description: "List tasks, newest first. Optional entity filter (entityType + entityId).",
    inputSchema: {
      type: "object",
      properties: { entityType: { type: "string" }, entityId: { type: "string" }, limit: { type: "number" } },
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "tasks", "read");
      const where: SQL[] = [];
      const et = str(args.entityType);
      const ei = str(args.entityId);
      if (et) where.push(eq(tables.tasks.entityType, et));
      if (ei) where.push(eq(tables.tasks.entityId, ei));
      return db
        .select()
        .from(tables.tasks)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(tables.tasks.createdAt))
        .limit(Math.min(num(args.limit, 50), 200));
    },
  },
  {
    name: "create_note",
    mutates: true,
    description: "Add a note to a contact, company, or deal.",
    inputSchema: {
      type: "object",
      properties: {
        body: { type: "string" },
        entityType: { type: "string", enum: ["contact", "company", "deal"] },
        entityId: { type: "string" },
      },
      required: ["body", "entityType", "entityId"],
    },
    handler: async (args, ctx) => {
      requireRole(ctx, "notes", "create");
      const parsed = noteInput.safeParse(args);
      if (!parsed.success) throw new ToolError(parsed.error.issues[0].message);
      const now = Date.now();
      const id = newId();
      await db.insert(tables.notes).values({ id, ...parsed.data, authorId: ctx.userId, createdAt: now });
      await logActivity({ type: "note_added", entityType: parsed.data.entityType, entityId: parsed.data.entityId, actorId: ctx.userId });
      await audit(ctx.userId, "note.created", { objectType: "note", objectId: id, meta: { via: ctx.via ?? "mcp" } });
      return (await db.select().from(tables.notes).where(eq(tables.notes.id, id)).limit(1))[0]!;
    },
  },
];

export { ToolError };
