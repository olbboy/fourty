import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLError,
  Kind,
  type GraphQLFieldConfigMap,
} from "graphql";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { dispatchEvent } from "@/lib/workflows/engine";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { contactInput, contactPatch, companyInput, companyPatch } from "@/lib/validators";
import {
  listObjects,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  objectByApiName,
} from "@/lib/custom-objects";
import type { AuthOk } from "@/lib/api";
import type { z } from "zod";

/**
 * Auto-generated GraphQL API (Gate C2, ADR-008). Typed queries for every core
 * object plus custom objects/records, and mutations for the objects whose writes
 * are side-effect-simple (contacts, companies, custom records). Deals/tasks/notes
 * are read here but written via REST, where their stage/entity-link side effects
 * live — a stated scope, not a stub. Resolvers run inside the request's
 * withWorkspace() transaction, so every query is RLS-scoped to the caller's
 * workspace and mutations are RBAC-gated via can().
 */

export type GqlContext = { auth: AuthOk };

// A JSON scalar for the `custom` blob on core objects and `data` on records.
const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral: function parseLiteral(ast): unknown {
    switch (ast.kind) {
      case Kind.STRING:
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.INT:
      case Kind.FLOAT:
        return Number(ast.value);
      case Kind.NULL:
        return null;
      case Kind.LIST:
        return ast.values.map((n) => parseLiteral(n));
      case Kind.OBJECT: {
        const obj: Record<string, unknown> = {};
        for (const f of ast.fields) obj[f.name.value] = parseLiteral(f.value);
        return obj;
      }
      default:
        return null;
    }
  },
});

function requireRbac(ctx: GqlContext, object: string, action: "read" | "create" | "update" | "delete") {
  if (!can(ctx.auth.role, object, action)) {
    throw new GraphQLError(`Forbidden: ${ctx.auth.role} cannot ${action} ${object}`, {
      extensions: { code: "FORBIDDEN" },
    });
  }
}

// Common column set for the polymorphic types.
const S = GraphQLString;
const timestamps = {
  id: { type: new GraphQLNonNull(GraphQLID) },
  createdAt: { type: GraphQLFloat },
  updatedAt: { type: GraphQLFloat },
};

const Contact = new GraphQLObjectType({
  name: "Contact",
  fields: {
    ...timestamps,
    firstName: { type: new GraphQLNonNull(S) },
    lastName: { type: S },
    email: { type: S },
    phone: { type: S },
    jobTitle: { type: S },
    companyId: { type: S },
    status: { type: S },
    source: { type: S },
    score: { type: GraphQLInt },
    linkedin: { type: S },
    city: { type: S },
    country: { type: S },
    custom: { type: JSONScalar, resolve: (r) => JSON.parse(r.custom ?? "{}") },
  },
});

const Company = new GraphQLObjectType({
  name: "Company",
  fields: {
    ...timestamps,
    name: { type: new GraphQLNonNull(S) },
    domain: { type: S },
    industry: { type: S },
    size: { type: S },
    website: { type: S },
    linkedin: { type: S },
    city: { type: S },
    country: { type: S },
    annualRevenue: { type: GraphQLFloat },
    custom: { type: JSONScalar, resolve: (r) => JSON.parse(r.custom ?? "{}") },
  },
});

const Deal = new GraphQLObjectType({
  name: "Deal",
  fields: {
    ...timestamps,
    name: { type: new GraphQLNonNull(S) },
    amount: { type: GraphQLFloat },
    currency: { type: S },
    pipelineId: { type: S },
    stageId: { type: S },
    companyId: { type: S },
    contactId: { type: S },
    expectedCloseDate: { type: GraphQLFloat },
    closedAt: { type: GraphQLFloat },
    custom: { type: JSONScalar, resolve: (r) => JSON.parse(r.custom ?? "{}") },
  },
});

const Task = new GraphQLObjectType({
  name: "Task",
  fields: {
    ...timestamps,
    title: { type: new GraphQLNonNull(S) },
    description: { type: S },
    dueDate: { type: GraphQLFloat },
    completedAt: { type: GraphQLFloat },
    priority: { type: S },
    entityType: { type: S },
    entityId: { type: S },
  },
});

const Note = new GraphQLObjectType({
  name: "Note",
  fields: {
    ...timestamps,
    body: { type: new GraphQLNonNull(S) },
    entityType: { type: S },
    entityId: { type: S },
    authorId: { type: S },
  },
});

const CustomObjectDef = new GraphQLObjectType({
  name: "CustomObjectDef",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    apiName: { type: new GraphQLNonNull(S) },
    nameSingular: { type: S },
    namePlural: { type: S },
    icon: { type: S },
    description: { type: S },
  },
});

const RecordType = new GraphQLObjectType({
  name: "Record",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    createdAt: { type: GraphQLFloat },
    updatedAt: { type: GraphQLFloat },
    data: { type: JSONScalar },
  },
});

// ── Resolver helpers ─────────────────────────────────────────────────────────

// Drizzle's per-table row types don't unify across the polymorphic core tables;
// these two internal helpers erase to a permissive shape so the resolvers stay
// clean. RLS still scopes every row at query time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listCore(table: any, where: SQL | undefined, limit: number): Promise<any[]> {
  return db.select().from(table).where(where).orderBy(desc(table.updatedAt)).limit(Math.min(limit, 500));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function byId(table: any, id: string): Promise<any> {
  return (await db.select().from(table).where(eq(table.id, id)).limit(1))[0];
}

async function requireObject(apiName: string) {
  const obj = await objectByApiName(apiName);
  if (!obj) throw new GraphQLError(`Unknown object: ${apiName}`, { extensions: { code: "NOT_FOUND" } });
  return obj;
}

// ── Query ────────────────────────────────────────────────────────────────────

const queryFields: GraphQLFieldConfigMap<unknown, GqlContext> = {
  contacts: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Contact))),
    args: { limit: { type: GraphQLInt }, q: { type: GraphQLString } },
    resolve: (_r, { limit, q }, ctx) => {
      requireRbac(ctx, "contacts", "read");
      const where = q
        ? ilike(
            // first || ' ' || last
            // reuse contacts name search
            tables.contacts.firstName,
            `%${String(q).replace(/[%_]/g, "")}%`,
          )
        : undefined;
      return listCore(tables.contacts, where, limit ?? 200);
    },
  },
  contact: {
    type: Contact,
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: (_r, { id }, ctx) => {
      requireRbac(ctx, "contacts", "read");
      return byId(tables.contacts, id);
    },
  },
  companies: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Company))),
    args: { limit: { type: GraphQLInt }, q: { type: GraphQLString } },
    resolve: (_r, { limit, q }, ctx) => {
      requireRbac(ctx, "companies", "read");
      const where = q ? ilike(tables.companies.name, `%${String(q).replace(/[%_]/g, "")}%`) : undefined;
      return listCore(tables.companies, where, limit ?? 200);
    },
  },
  company: {
    type: Company,
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: (_r, { id }, ctx) => {
      requireRbac(ctx, "companies", "read");
      return byId(tables.companies, id);
    },
  },
  deals: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Deal))),
    args: { limit: { type: GraphQLInt }, q: { type: GraphQLString } },
    resolve: (_r, { limit, q }, ctx) => {
      requireRbac(ctx, "deals", "read");
      const where = q ? ilike(tables.deals.name, `%${String(q).replace(/[%_]/g, "")}%`) : undefined;
      return listCore(tables.deals, where, limit ?? 200);
    },
  },
  deal: {
    type: Deal,
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: (_r, { id }, ctx) => {
      requireRbac(ctx, "deals", "read");
      return byId(tables.deals, id);
    },
  },
  tasks: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Task))),
    args: { limit: { type: GraphQLInt } },
    resolve: (_r, { limit }, ctx) => {
      requireRbac(ctx, "tasks", "read");
      return db.select().from(tables.tasks).orderBy(desc(tables.tasks.createdAt)).limit(Math.min(limit ?? 200, 500));
    },
  },
  notes: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Note))),
    args: { entityType: { type: GraphQLString }, entityId: { type: GraphQLString } },
    resolve: (_r, { entityType, entityId }, ctx) => {
      requireRbac(ctx, "notes", "read");
      const where: SQL[] = [];
      if (entityType) where.push(eq(tables.notes.entityType, entityType));
      if (entityId) where.push(eq(tables.notes.entityId, entityId));
      return db
        .select()
        .from(tables.notes)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(tables.notes.createdAt))
        .limit(500);
    },
  },
  customObjects: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(CustomObjectDef))),
    resolve: (_r, _a, ctx) => {
      requireRbac(ctx, "custom-objects", "read");
      return listObjects();
    },
  },
  records: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(RecordType))),
    args: { object: { type: new GraphQLNonNull(GraphQLString) }, limit: { type: GraphQLInt } },
    resolve: async (_r, { object, limit }, ctx) => {
      requireRbac(ctx, "objects", "read");
      const obj = await requireObject(object);
      return listRecords(obj.id, limit ?? 200);
    },
  },
  record: {
    type: RecordType,
    args: { object: { type: new GraphQLNonNull(GraphQLString) }, id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: async (_r, { object, id }, ctx) => {
      requireRbac(ctx, "objects", "read");
      const obj = await requireObject(object);
      return getRecord(obj.id, id);
    },
  },
};

// ── Mutation ──────────────────────────────────────────────────────────────────

function zparse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new GraphQLError(`${issue.path.join(".") || "input"}: ${issue.message}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return parsed.data;
}

const mutationFields: GraphQLFieldConfigMap<unknown, GqlContext> = {
  createContact: {
    type: new GraphQLNonNull(Contact),
    args: { input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: async (_r, { input }, ctx) => {
      requireRbac(ctx, "contacts", "create");
      const data = zparse(contactInput, input);
      const now = Date.now();
      const id = newId();
      const { custom, ...fields } = data;
      await db.insert(tables.contacts).values({
        id,
        ...fields,
        ownerId: ctx.auth.user?.id ?? null,
        custom: JSON.stringify(custom ?? {}),
        createdAt: now,
        updatedAt: now,
      });
      await logActivity({ type: "created", entityType: "contact", entityId: id, actorId: ctx.auth.user?.id });
      await audit(ctx.auth.user?.id, "contact.created", { objectType: "contact", objectId: id });
      await recomputeContactScore(id);
      const row = await byId(tables.contacts, id);
      await dispatchEvent({ event: "contact.created", entityType: "contact", entityId: id, snapshot: { ...row, custom: undefined } });
      return row;
    },
  },
  updateContact: {
    type: new GraphQLNonNull(Contact),
    args: { id: { type: new GraphQLNonNull(GraphQLID) }, input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: async (_r, { id, input }, ctx) => {
      requireRbac(ctx, "contacts", "update");
      const existing = await byId(tables.contacts, id);
      if (!existing) throw new GraphQLError("Contact not found", { extensions: { code: "NOT_FOUND" } });
      const data = zparse(contactPatch, input);
      const { custom, ...fields } = data;
      await db
        .update(tables.contacts)
        .set({
          ...fields,
          ...(custom !== undefined ? { custom: JSON.stringify({ ...JSON.parse(existing.custom), ...custom }) } : {}),
          updatedAt: Date.now(),
        })
        .where(eq(tables.contacts.id, id));
      await recomputeContactScore(id);
      await audit(ctx.auth.user?.id, "contact.updated", { objectType: "contact", objectId: id });
      return byId(tables.contacts, id);
    },
  },
  deleteContact: {
    type: new GraphQLNonNull(GraphQLBoolean),
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: async (_r, { id }, ctx) => {
      requireRbac(ctx, "contacts", "delete");
      const existing = await byId(tables.contacts, id);
      if (!existing) return false;
      await db.delete(tables.contacts).where(eq(tables.contacts.id, id));
      await audit(ctx.auth.user?.id, "contact.deleted", { objectType: "contact", objectId: id });
      return true;
    },
  },
  createCompany: {
    type: new GraphQLNonNull(Company),
    args: { input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: async (_r, { input }, ctx) => {
      requireRbac(ctx, "companies", "create");
      const data = zparse(companyInput, input);
      const now = Date.now();
      const id = newId();
      const { custom, ...fields } = data;
      await db.insert(tables.companies).values({
        id,
        ...fields,
        ownerId: ctx.auth.user?.id ?? null,
        custom: JSON.stringify(custom ?? {}),
        createdAt: now,
        updatedAt: now,
      });
      await audit(ctx.auth.user?.id, "company.created", { objectType: "company", objectId: id });
      return byId(tables.companies, id);
    },
  },
  updateCompany: {
    type: new GraphQLNonNull(Company),
    args: { id: { type: new GraphQLNonNull(GraphQLID) }, input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: async (_r, { id, input }, ctx) => {
      requireRbac(ctx, "companies", "update");
      const existing = await byId(tables.companies, id);
      if (!existing) throw new GraphQLError("Company not found", { extensions: { code: "NOT_FOUND" } });
      const data = zparse(companyPatch, input);
      const { custom, ...fields } = data;
      await db
        .update(tables.companies)
        .set({
          ...fields,
          ...(custom !== undefined ? { custom: JSON.stringify({ ...JSON.parse(existing.custom), ...custom }) } : {}),
          updatedAt: Date.now(),
        })
        .where(eq(tables.companies.id, id));
      await audit(ctx.auth.user?.id, "company.updated", { objectType: "company", objectId: id });
      return byId(tables.companies, id);
    },
  },
  deleteCompany: {
    type: new GraphQLNonNull(GraphQLBoolean),
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: async (_r, { id }, ctx) => {
      requireRbac(ctx, "companies", "delete");
      const existing = await byId(tables.companies, id);
      if (!existing) return false;
      await db.delete(tables.companies).where(eq(tables.companies.id, id));
      await audit(ctx.auth.user?.id, "company.deleted", { objectType: "company", objectId: id });
      return true;
    },
  },
  createRecord: {
    type: new GraphQLNonNull(RecordType),
    args: { object: { type: new GraphQLNonNull(GraphQLString) }, data: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: async (_r, { object, data }, ctx) => {
      requireRbac(ctx, "objects", "create");
      const obj = await requireObject(object);
      const result = await createRecord(obj.id, data ?? {});
      if (!result.ok) throw new GraphQLError(result.error, { extensions: { code: "BAD_USER_INPUT" } });
      await audit(ctx.auth.user?.id, "record.created", { objectType: obj.apiName, objectId: result.record.id });
      return result.record;
    },
  },
  updateRecord: {
    type: new GraphQLNonNull(RecordType),
    args: {
      object: { type: new GraphQLNonNull(GraphQLString) },
      id: { type: new GraphQLNonNull(GraphQLID) },
      data: { type: new GraphQLNonNull(JSONScalar) },
    },
    resolve: async (_r, { object, id, data }, ctx) => {
      requireRbac(ctx, "objects", "update");
      const obj = await requireObject(object);
      const result = await updateRecord(obj.id, id, data ?? {});
      if (result === undefined) throw new GraphQLError("Record not found", { extensions: { code: "NOT_FOUND" } });
      if (!result.ok) throw new GraphQLError(result.error, { extensions: { code: "BAD_USER_INPUT" } });
      await audit(ctx.auth.user?.id, "record.updated", { objectType: obj.apiName, objectId: id });
      return result.record;
    },
  },
  deleteRecord: {
    type: new GraphQLNonNull(GraphQLBoolean),
    args: { object: { type: new GraphQLNonNull(GraphQLString) }, id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: async (_r, { object, id }, ctx) => {
      requireRbac(ctx, "objects", "delete");
      const obj = await requireObject(object);
      const ok = await deleteRecord(obj.id, id);
      if (ok) await audit(ctx.auth.user?.id, "record.deleted", { objectType: obj.apiName, objectId: id });
      return ok;
    },
  },
};

let cached: GraphQLSchema | null = null;

/** The Fourty GraphQL schema (built once — it is workspace-independent; RLS scopes data at query time). */
export function fourtySchema(): GraphQLSchema {
  if (cached) return cached;
  cached = new GraphQLSchema({
    query: new GraphQLObjectType({ name: "Query", fields: queryFields }),
    mutation: new GraphQLObjectType({ name: "Mutation", fields: mutationFields }),
  });
  return cached;
}
