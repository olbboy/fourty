import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { can } from "@/lib/permissions";
import { loadFieldPolicy, redact, blockedWrites, type FieldPolicy } from "@/lib/field-permissions";
import { audit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { contactInput, companyInput } from "@/lib/validators";
import { computeDashboardStats } from "@/lib/services/stats";
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
export type ToolContext = { workspaceId: string; role: string; userId: string | null };

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
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
      await audit(ctx.userId, "contact.created", { objectType: "contact", objectId: id, meta: { via: "mcp" } });
      await recomputeContactScore(id);
      const row = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0]!;
      return redact(policy, "contacts", { ...row, custom: JSON.parse(row.custom) });
    },
  },
  {
    name: "list_companies",
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
      await audit(ctx.userId, "company.created", { objectType: "company", objectId: id, meta: { via: "mcp" } });
      const row = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0]!;
      return redact(policy, "companies", { ...row, custom: JSON.parse(row.custom) });
    },
  },
  {
    name: "list_deals",
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
    description: "Return the CRM dashboard analytics (pipeline, forecast, win rate, hot leads, etc.).",
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      requireRole(ctx, "contacts", "read");
      return computeDashboardStats();
    },
  },
  {
    name: "list_custom_objects",
    description: "List the workspace's no-code custom object types.",
    inputSchema: { type: "object", properties: {} },
    handler: async (_args, ctx) => {
      requireRole(ctx, "custom-objects", "read");
      return listObjects();
    },
  },
  {
    name: "list_records",
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
      await audit(ctx.userId, "record.created", { objectType: obj.apiName, objectId: result.record.id, meta: { via: "mcp" } });
      return result.record;
    },
  },
];

export { ToolError };
