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
import { can } from "@/lib/permissions";
import { toResolver } from "@/lib/actions/adapters/graphql";
import { contactsCreate, contactsDelete, contactsGet, contactsList, contactsUpdate } from "@/lib/actions/contacts";
import { companiesCreate, companiesDelete, companiesGet, companiesList, companiesUpdate } from "@/lib/actions/companies";
import { dealsCreate, dealsDelete, dealsGet, dealsList, dealsUpdate } from "@/lib/actions/deals";
import { dealStageClock } from "@/lib/actions/deals/shared";
import { tasksCreate, tasksDelete, tasksGet, tasksList, tasksUpdate } from "@/lib/actions/tasks";
import { getAssignee, listAssignees } from "@/lib/actions/tasks/shared";
import { notesCreate, notesList } from "@/lib/actions/notes";
import { activitiesCreate, activitiesList } from "@/lib/actions/activities";
import { factsDecide, factsList, factsRecord } from "@/lib/actions/facts";
import { searchCrm } from "@/lib/services/search";
import { dashboardStatsForRole, reportStatsForRole } from "@/lib/services/stats";
import { getPipelineWithStages, listPipelinesWithStages, listStages } from "@/lib/services/pipelines";
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

/**
 * Auto-generated GraphQL API (Gate C2, ADR-008). Typed queries for every core
 * object plus custom objects/records. Mutations cover contacts, companies,
 * deals, tasks, notes, the activity timeline, and custom records. Resolvers
 * run inside the request's withWorkspace() transaction, so every query is
 * RLS-scoped to the caller's workspace and mutations are RBAC-gated via can().
 */

export type GqlContext = {
  auth: AuthOk;
};

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

// Field-level permissions (ADR-011) run inside the action kernel for every
// resolver that goes through toResolver. Hand-wired queries either call a
// service that already redacts (`search`, `dashboardStats`, `reportStats`) or are object-level
// RBAC only (custom-object records).

// Common column set for the polymorphic types.
/**
 * The `custom` blob reaches this layer either as the raw column text or already
 * parsed, depending on whether the field came straight off a query or through
 * an action. Both mean the same value.
 */
const parseCustom = (custom: unknown): Record<string, unknown> =>
  typeof custom === "string" ? JSON.parse(custom || "{}") : ((custom ?? {}) as Record<string, unknown>);

const S = GraphQLString;
const timestamps = {
  id: { type: new GraphQLNonNull(GraphQLID) },
  createdAt: { type: GraphQLFloat },
  updatedAt: { type: GraphQLFloat },
};

const Contact: GraphQLObjectType = new GraphQLObjectType({
  name: "Contact",
  fields: () => ({
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
    custom: { type: JSONScalar, resolve: (r: { id: string; custom?: unknown; companyId?: string | null }) => parseCustom(r.custom) },
    // Nested company so the published example `{ contacts { company { name } } }`
    // works. Hidden `companyId` (field perms) means this stays null.
    company: {
      type: Company,
      resolve: (row: { id: string; custom?: unknown; companyId?: string | null }, _args: unknown, ctx: GqlContext) => {
        if (!row.companyId) return null;
        return toResolver(companiesGet, { onNotFound: () => null })(row, { id: row.companyId }, ctx);
      },
    },
    deals: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Deal))),
      resolve: (row: { id: string; custom?: unknown; companyId?: string | null }, _args: unknown, ctx: GqlContext) =>
        toResolver(dealsList)(row, { contactId: row.id }, ctx),
    },
    colleagues: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Contact))),
      resolve: async (row: { id: string; custom?: unknown; companyId?: string | null }, _args: unknown, ctx: GqlContext) => {
        if (!row.companyId) return [];
        const people = (await toResolver(contactsList)(row, { companyId: row.companyId }, ctx)) as { id: string }[];
        return people.filter((p) => p.id !== row.id);
      },
    },
    ...recordChildren("contact"),
    ...factChildren("contact"),
  }),
});

const Company: GraphQLObjectType = new GraphQLObjectType({
  name: "Company",
  fields: () => ({
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
    custom: { type: JSONScalar, resolve: (r: { id: string; custom?: unknown }) => parseCustom(r.custom) },
    contacts: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Contact))),
      resolve: (row: { id: string; custom?: unknown }, _args: unknown, ctx: GqlContext) =>
        toResolver(contactsList)(row, { companyId: row.id }, ctx),
    },
    deals: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Deal))),
      resolve: (row: { id: string; custom?: unknown }, _args: unknown, ctx: GqlContext) =>
        toResolver(dealsList)(row, { companyId: row.id }, ctx),
    },
    ...recordChildren("company"),
    ...factChildren("company"),
  }),
});

/**
 * A claim the evidence ledger holds about one field (ADR-018). `evidence` is the
 * observations as given — it is data a client renders as text, never as HTML,
 * and it is what makes a suggestion answerable rather than merely scored.
 */
const RecordFact: GraphQLObjectType = new GraphQLObjectType({
  name: "RecordFact",
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    entityType: { type: new GraphQLNonNull(S) },
    entityId: { type: new GraphQLNonNull(GraphQLID) },
    field: { type: new GraphQLNonNull(S) },
    value: { type: new GraphQLNonNull(S) },
    previousValue: { type: S },
    score: { type: GraphQLFloat },
    band: { type: S },
    evidence: {
      type: JSONScalar,
      resolve: (r: PinRow & { evidence?: string | null }) => JSON.parse(r.evidence ?? "[]"),
    },
    method: { type: S },
    sourceUrl: { type: S },
    status: { type: S },
    decidedBy: { type: S },
    decidedAt: { type: GraphQLFloat },
    observedAt: { type: GraphQLFloat },
    supersededAt: { type: GraphQLFloat },
    // Facts only attach to contacts and companies (FACT_ENTITIES); deal/record stay null.
    ...pinFields(),
  }),
});

/** What recording or deciding answered. `reason` is written for a human to read. */
const FactResult = new GraphQLObjectType({
  name: "FactResult",
  fields: {
    ok: { type: new GraphQLNonNull(GraphQLBoolean) },
    applied: { type: GraphQLBoolean },
    reason: { type: new GraphQLNonNull(S) },
    fact: { type: RecordFact },
  },
});

const DealStage = new GraphQLObjectType({
  name: "DealStage",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    name: { type: S },
    type: { type: S },
    enteredAt: { type: GraphQLFloat },
    daysInStage: { type: GraphQLInt },
  },
});

type DealRow = {
  id: string;
  custom?: unknown;
  companyId?: string | null;
  contactId?: string | null;
  stageId?: string | null;
  stageEnteredAt?: number;
};

const Deal: GraphQLObjectType = new GraphQLObjectType({
  name: "Deal",
  fields: () => ({
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
    score: { type: GraphQLInt },
    custom: { type: JSONScalar, resolve: (r: DealRow) => parseCustom(r.custom) },
    // Same as Contact.company: one round trip, and a hidden id stays null.
    company: {
      type: Company,
      resolve: (row: DealRow, _args: unknown, ctx: GqlContext) => {
        if (!row.companyId) return null;
        return toResolver(companiesGet, { onNotFound: () => null })(row, { id: row.companyId }, ctx);
      },
    },
    contact: {
      type: Contact,
      resolve: (row: DealRow, _args: unknown, ctx: GqlContext) => {
        if (!row.contactId) return null;
        return toResolver(contactsGet, { onNotFound: () => null })(row, { id: row.contactId }, ctx);
      },
    },
    stage: {
      type: DealStage,
      resolve: async (row: DealRow) => {
        if (!row.stageId || row.stageEnteredAt == null) return null;
        return dealStageClock({ stageId: row.stageId, stageEnteredAt: row.stageEnteredAt });
      },
    },
    ...recordChildren("deal"),
  }),
});

const Assignee = new GraphQLObjectType({
  name: "Assignee",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    name: { type: new GraphQLNonNull(S) },
  },
});

type PinRow = { entityType?: string | null; entityId?: string | null };

const CRM_PIN = new Set(["contact", "company", "deal"]);

async function resolvePinnedRecord(row: PinRow, _args: unknown, ctx: GqlContext) {
  if (!row.entityType || !row.entityId || CRM_PIN.has(row.entityType)) return null;
  requireRbac(ctx, "objects", "read");
  const obj = await objectByApiName(row.entityType);
  if (!obj) return null;
  const rec = await getRecord(obj.id, row.entityId);
  return rec ? { ...rec, object: row.entityType } : null;
}

/**
 * Nested pin used by Task, Note, Activity, and RecordFact. CRM pins nest
 * contact / company / deal; a custom-object pin nests `record`.
 */
function pinFields(): GraphQLFieldConfigMap<PinRow, GqlContext> {
  return {
    contact: {
      type: Contact,
      resolve: (row: PinRow, _args: unknown, ctx: GqlContext) => {
        if (row.entityType !== "contact" || !row.entityId) return null;
        return toResolver(contactsGet, { onNotFound: () => null })(row, { id: row.entityId }, ctx);
      },
    },
    company: {
      type: Company,
      resolve: (row: PinRow, _args: unknown, ctx: GqlContext) => {
        if (row.entityType !== "company" || !row.entityId) return null;
        return toResolver(companiesGet, { onNotFound: () => null })(row, { id: row.entityId }, ctx);
      },
    },
    deal: {
      type: Deal,
      resolve: (row: PinRow, _args: unknown, ctx: GqlContext) => {
        if (row.entityType !== "deal" || !row.entityId) return null;
        return toResolver(dealsGet, { onNotFound: () => null })(row, { id: row.entityId }, ctx);
      },
    },
    record: {
      type: RecordType,
      resolve: resolvePinnedRecord,
    },
  };
}

const Task: GraphQLObjectType = new GraphQLObjectType({
  name: "Task",
  fields: () => ({
    ...timestamps,
    title: { type: new GraphQLNonNull(S) },
    description: { type: S },
    dueDate: { type: GraphQLFloat },
    completedAt: { type: GraphQLFloat },
    priority: { type: S },
    ownerId: { type: S },
    owner: {
      type: Assignee,
      resolve: async (row: PinRow & { ownerId?: string | null }) => {
        if (!row.ownerId) return null;
        return (await getAssignee(row.ownerId)) ?? null;
      },
    },
    entityType: { type: S },
    entityId: { type: S },
    ...pinFields(),
  }),
});

const Note: GraphQLObjectType = new GraphQLObjectType({
  name: "Note",
  fields: () => ({
    ...timestamps,
    body: { type: new GraphQLNonNull(S) },
    entityType: { type: S },
    entityId: { type: S },
    authorId: { type: S },
    ...pinFields(),
  }),
});

const Activity: GraphQLObjectType = new GraphQLObjectType({
  name: "Activity",
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    createdAt: { type: GraphQLFloat },
    type: { type: new GraphQLNonNull(S) },
    entityType: { type: S },
    entityId: { type: S },
    actorId: { type: S },
    meta: {
      type: JSONScalar,
      resolve: (r: { meta?: unknown }) =>
        typeof r.meta === "string" ? JSON.parse(r.meta || "{}") : ((r.meta ?? {}) as Record<string, unknown>),
    },
    ...pinFields(),
  }),
});

function factChildren(entityType: "contact" | "company") {
  return {
    facts: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(RecordFact))),
      resolve: (row: { id: string }, _args: unknown, ctx: GqlContext) =>
        toResolver(factsList)(row, { entityType, entityId: row.id }, ctx),
    },
  };
}

function recordChildren(entityType: string) {
  return {
    tasks: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Task))),
      resolve: (row: { id: string }, _args: unknown, ctx: GqlContext) =>
        toResolver(tasksList)(row, { entityType, entityId: row.id, state: "all" }, ctx),
    },
    notes: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Note))),
      resolve: (row: { id: string }, _args: unknown, ctx: GqlContext) =>
        toResolver(notesList)(row, { entityType, entityId: row.id }, ctx),
    },
    activities: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Activity))),
      resolve: (row: { id: string }, _args: unknown, ctx: GqlContext) =>
        toResolver(activitiesList)(row, { entityType, entityId: row.id }, ctx),
    },
  };
}

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

type CustomRecordRow = { id: string; object?: string };

const customRecordChildren: GraphQLFieldConfigMap<CustomRecordRow, GqlContext> = {
  tasks: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Task))),
    resolve: (row: CustomRecordRow, _args: unknown, ctx: GqlContext) => {
      if (!row.object) return [];
      return toResolver(tasksList)(row, { entityType: row.object, entityId: row.id, state: "all" }, ctx);
    },
  },
  notes: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Note))),
    resolve: (row: CustomRecordRow, _args: unknown, ctx: GqlContext) => {
      if (!row.object) return [];
      return toResolver(notesList)(row, { entityType: row.object, entityId: row.id }, ctx);
    },
  },
  activities: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Activity))),
    resolve: (row: CustomRecordRow, _args: unknown, ctx: GqlContext) => {
      if (!row.object) return [];
      return toResolver(activitiesList)(row, { entityType: row.object, entityId: row.id }, ctx);
    },
  },
};

const RecordType: GraphQLObjectType = new GraphQLObjectType({
  name: "Record",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    object: {
      type: S,
      resolve: (row: CustomRecordRow) => row.object ?? null,
    },
    createdAt: { type: GraphQLFloat },
    updatedAt: { type: GraphQLFloat },
    data: { type: JSONScalar },
    ...customRecordChildren,
  },
});

const SearchResult = new GraphQLObjectType({
  name: "SearchResult",
  fields: () => ({
    contacts: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Contact))) },
    companies: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Company))) },
    deals: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Deal))) },
    records: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(RecordType))) },
    note: { type: S },
  }),
});

const DashboardKpis = new GraphQLObjectType({
  name: "DashboardKpis",
  fields: {
    pipelineValue: { type: GraphQLFloat },
    weightedForecast: { type: GraphQLFloat },
    wonThisMonth: { type: GraphQLFloat },
    winRate: { type: GraphQLInt },
    avgDealSize: { type: GraphQLFloat },
    avgCycleDays: { type: GraphQLInt },
    openDeals: { type: GraphQLInt },
    contacts: { type: GraphQLInt },
    openTasks: { type: GraphQLInt },
    overdueTasks: { type: GraphQLInt },
  },
});

const DashboardFunnelRow = new GraphQLObjectType({
  name: "DashboardFunnelRow",
  fields: {
    stage: { type: S },
    count: { type: GraphQLInt },
    value: { type: GraphQLFloat },
  },
});

const DashboardMonthRow = new GraphQLObjectType({
  name: "DashboardMonthRow",
  fields: {
    month: { type: S },
    won: { type: GraphQLFloat },
    lost: { type: GraphQLFloat },
  },
});

const DashboardWeekRow = new GraphQLObjectType({
  name: "DashboardWeekRow",
  fields: {
    week: { type: S },
    count: { type: GraphQLInt },
  },
});

const DashboardHotLead = new GraphQLObjectType({
  name: "DashboardHotLead",
  fields: {
    id: { type: GraphQLID },
    name: { type: S },
    score: { type: GraphQLInt },
    status: { type: S },
    jobTitle: { type: S },
  },
});

const DashboardDueTask = new GraphQLObjectType({
  name: "DashboardDueTask",
  fields: {
    id: { type: GraphQLID },
    title: { type: S },
    dueDate: { type: GraphQLFloat },
    priority: { type: S },
    overdue: { type: GraphQLBoolean },
    entityType: { type: S },
    entityId: { type: S },
  },
});

const DashboardStaleDeal = new GraphQLObjectType({
  name: "DashboardStaleDeal",
  fields: {
    id: { type: GraphQLID },
    name: { type: S },
    amount: { type: GraphQLFloat },
    currency: { type: S },
    stage: { type: S },
    daysInStage: { type: GraphQLInt },
    score: { type: GraphQLInt },
  },
});

const DashboardStats = new GraphQLObjectType({
  name: "DashboardStats",
  fields: {
    kpis: { type: new GraphQLNonNull(DashboardKpis) },
    funnel: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(DashboardFunnelRow))) },
    revenueByMonth: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(DashboardMonthRow))) },
    activityByWeek: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(DashboardWeekRow))) },
    hotLeads: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(DashboardHotLead))) },
    dueTasks: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(DashboardDueTask))) },
    staleDeals: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(DashboardStaleDeal))) },
  },
});

const ReportSourceRow = new GraphQLObjectType({
  name: "ReportSourceRow",
  fields: {
    source: { type: S },
    leads: { type: GraphQLInt },
    customers: { type: GraphQLInt },
    conversion: { type: GraphQLInt },
  },
});

const ReportWinLossRow = new GraphQLObjectType({
  name: "ReportWinLossRow",
  fields: {
    month: { type: S },
    won: { type: GraphQLInt },
    lost: { type: GraphQLInt },
  },
});

const ReportAgingRow = new GraphQLObjectType({
  name: "ReportAgingRow",
  fields: {
    id: { type: GraphQLID },
    name: { type: S },
    stage: { type: S },
    amountUsd: { type: GraphQLFloat },
    daysInStage: { type: GraphQLInt },
    expectedCloseDate: { type: GraphQLFloat },
    overdue: { type: GraphQLBoolean },
    score: { type: GraphQLInt },
  },
});

const ReportScoreBand = new GraphQLObjectType({
  name: "ReportScoreBand",
  fields: {
    band: { type: S },
    count: { type: GraphQLInt },
  },
});

const ReportStatusRow = new GraphQLObjectType({
  name: "ReportStatusRow",
  fields: {
    status: { type: S },
    count: { type: GraphQLInt },
  },
});

const ReportStats = new GraphQLObjectType({
  name: "ReportStats",
  fields: {
    sourceBreakdown: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ReportSourceRow))) },
    winLoss: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ReportWinLossRow))) },
    aging: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ReportAgingRow))) },
    scoreBands: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ReportScoreBand))) },
    statusBreakdown: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ReportStatusRow))) },
  },
});

type PipelineRow = { id: string; stages?: unknown[] };

const StageType = new GraphQLObjectType({
  name: "Stage",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    pipelineId: { type: S },
    name: { type: S },
    type: { type: S },
    order: { type: GraphQLInt },
    winProbability: { type: GraphQLInt },
    color: { type: S },
  },
});

const PipelineType = new GraphQLObjectType({
  name: "Pipeline",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    name: { type: S },
    isDefault: { type: GraphQLInt },
    createdAt: { type: GraphQLFloat },
    stages: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(StageType))),
      resolve: (row: PipelineRow) => row.stages ?? [],
    },
  },
});

// ── Resolver helpers ─────────────────────────────────────────────────────────

async function requireObject(apiName: string) {
  const obj = await objectByApiName(apiName);
  if (!obj) throw new GraphQLError(`Unknown object: ${apiName}`, { extensions: { code: "NOT_FOUND" } });
  return obj;
}

// ── Query ────────────────────────────────────────────────────────────────────

const queryFields: GraphQLFieldConfigMap<unknown, GqlContext> = {
  contacts: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Contact))),
    args: {
      limit: { type: GraphQLInt },
      q: { type: GraphQLString },
      sort: { type: GraphQLString },
      status: { type: GraphQLString },
      companyId: { type: GraphQLString },
    },
    resolve: toResolver(contactsList),
  },
  contact: {
    type: Contact,
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: toResolver(contactsGet, { onNotFound: () => null }),
  },
  factSuggestions: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(RecordFact))),
    args: {
      entityType: { type: GraphQLString },
      entityId: { type: GraphQLID },
      status: { type: GraphQLString },
      limit: { type: GraphQLInt },
    },
    resolve: toResolver(factsList),
  },
  companies: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Company))),
    args: { limit: { type: GraphQLInt }, q: { type: GraphQLString }, industry: { type: GraphQLString } },
    resolve: toResolver(companiesList),
  },
  company: {
    type: Company,
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: toResolver(companiesGet, { onNotFound: () => null }),
  },
  deals: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Deal))),
    args: {
      limit: { type: GraphQLInt },
      q: { type: GraphQLString },
      stageId: { type: GraphQLString },
      pipelineId: { type: GraphQLString },
      companyId: { type: GraphQLString },
      contactId: { type: GraphQLString },
    },
    resolve: toResolver(dealsList),
  },
  deal: {
    type: Deal,
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: toResolver(dealsGet, { onNotFound: () => null }),
  },
  tasks: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Task))),
    args: {
      limit: { type: GraphQLInt },
      state: { type: GraphQLString },
      entityType: { type: GraphQLString },
      entityId: { type: GraphQLString },
      sort: { type: GraphQLString },
    },
    resolve: toResolver(tasksList, { defaults: { state: "all", sort: "createdAt", limit: 200 } }),
  },
  task: {
    type: Task,
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: toResolver(tasksGet, { onNotFound: () => null }),
  },
  assignees: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Assignee))),
    resolve: (_r, _a, ctx) => {
      requireRbac(ctx, "tasks", "read");
      return listAssignees();
    },
  },
  notes: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Note))),
    args: {
      limit: { type: GraphQLInt },
      entityType: { type: GraphQLString },
      entityId: { type: GraphQLString },
    },
    resolve: toResolver(notesList),
  },
  activities: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Activity))),
    args: {
      limit: { type: GraphQLInt },
      entityType: { type: GraphQLString },
      entityId: { type: GraphQLString },
    },
    resolve: toResolver(activitiesList),
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
    args: {
      object: { type: new GraphQLNonNull(GraphQLString) },
      limit: { type: GraphQLInt },
      q: { type: GraphQLString },
      sort: { type: GraphQLString },
    },
    resolve: async (_r, { object, limit, q, sort }, ctx) => {
      requireRbac(ctx, "objects", "read");
      const obj = await requireObject(object);
      return (await listRecords(obj.id, { limit: limit ?? 200, q, sort })).map((r) => ({ ...r, object }));
    },
  },
  record: {
    type: RecordType,
    args: { object: { type: new GraphQLNonNull(GraphQLString) }, id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: async (_r, { object, id }, ctx) => {
      requireRbac(ctx, "objects", "read");
      const obj = await requireObject(object);
      const row = await getRecord(obj.id, id);
      return row ? { ...row, object } : row;
    },
  },
  search: {
    type: new GraphQLNonNull(SearchResult),
    args: {
      q: { type: new GraphQLNonNull(GraphQLString) },
      limit: { type: GraphQLInt },
    },
    resolve: async (_r, { q, limit }, ctx) => {
      requireRbac(ctx, "contacts", "read");
      const query = String(q ?? "").trim();
      if (!query) return { contacts: [], companies: [], deals: [], records: [] };
      const hits = await searchCrm(query, {
        mode: "prefix",
        limit: Math.min(Number(limit) || 10, 25),
        role: ctx.auth.role,
      });
      const empty =
        hits.contacts.length === 0 &&
        hits.companies.length === 0 &&
        hits.deals.length === 0 &&
        hits.records.length === 0;
      return {
        ...hits,
        ...(empty
          ? {
              note: `No exact or prefix match for "${query}". This search is not fuzzy — try a shorter prefix, the surname alone, or an email address.`,
            }
          : {}),
      };
    },
  },
  dashboardStats: {
    type: new GraphQLNonNull(DashboardStats),
    resolve: async (_r, _a, ctx) => {
      requireRbac(ctx, "contacts", "read");
      return dashboardStatsForRole(ctx.auth.role);
    },
  },
  reportStats: {
    type: new GraphQLNonNull(ReportStats),
    resolve: async (_r, _a, ctx) => {
      requireRbac(ctx, "contacts", "read");
      return reportStatsForRole(ctx.auth.role);
    },
  },
  pipelines: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(PipelineType))),
    resolve: async (_r, _a, ctx) => {
      requireRbac(ctx, "pipelines", "read");
      return listPipelinesWithStages();
    },
  },
  pipeline: {
    type: PipelineType,
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: async (_r, { id }, ctx) => {
      requireRbac(ctx, "pipelines", "read");
      return getPipelineWithStages(String(id));
    },
  },
  stages: {
    type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(StageType))),
    args: { pipelineId: { type: GraphQLString } },
    resolve: async (_r, { pipelineId }, ctx) => {
      requireRbac(ctx, "pipelines", "read");
      return listStages(pipelineId ? String(pipelineId) : undefined);
    },
  },
};

// ── Mutation ──────────────────────────────────────────────────────────────────

const mutationFields: GraphQLFieldConfigMap<unknown, GqlContext> = {
  createContact: {
    type: new GraphQLNonNull(Contact),
    args: { input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(contactsCreate),
  },
  updateContact: {
    type: new GraphQLNonNull(Contact),
    args: { id: { type: new GraphQLNonNull(GraphQLID) }, input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(contactsUpdate),
  },
  recordFact: {
    type: new GraphQLNonNull(FactResult),
    args: { input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(factsRecord),
  },
  decideFact: {
    type: new GraphQLNonNull(FactResult),
    args: {
      id: { type: new GraphQLNonNull(GraphQLID) },
      decision: { type: new GraphQLNonNull(GraphQLString) },
    },
    resolve: toResolver(factsDecide),
  },
  deleteContact: {
    type: new GraphQLNonNull(GraphQLBoolean),
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    // Answering `false` for an unknown id is the idiom this API has always
    // used; it is deliberately not the 404 the REST route returns.
    resolve: toResolver(contactsDelete, { onNotFound: () => false, map: () => true }),
  },
  createCompany: {
    type: new GraphQLNonNull(Company),
    args: { input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(companiesCreate),
  },
  updateCompany: {
    type: new GraphQLNonNull(Company),
    args: { id: { type: new GraphQLNonNull(GraphQLID) }, input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(companiesUpdate),
  },
  deleteCompany: {
    type: new GraphQLNonNull(GraphQLBoolean),
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: toResolver(companiesDelete, { onNotFound: () => false, map: () => true }),
  },
  createDeal: {
    type: new GraphQLNonNull(Deal),
    args: { input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(dealsCreate),
  },
  updateDeal: {
    type: new GraphQLNonNull(Deal),
    args: { id: { type: new GraphQLNonNull(GraphQLID) }, input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(dealsUpdate),
  },
  deleteDeal: {
    type: new GraphQLNonNull(GraphQLBoolean),
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: toResolver(dealsDelete, { onNotFound: () => false, map: () => true }),
  },
  createTask: {
    type: new GraphQLNonNull(Task),
    args: { input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(tasksCreate),
  },
  updateTask: {
    type: new GraphQLNonNull(Task),
    args: { id: { type: new GraphQLNonNull(GraphQLID) }, input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(tasksUpdate),
  },
  deleteTask: {
    type: new GraphQLNonNull(GraphQLBoolean),
    args: { id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: toResolver(tasksDelete, { onNotFound: () => false, map: () => true }),
  },
  createNote: {
    type: new GraphQLNonNull(Note),
    args: { input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(notesCreate),
  },
  logActivity: {
    type: new GraphQLNonNull(Activity),
    args: { input: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: toResolver(activitiesCreate),
  },
  createRecord: {
    type: new GraphQLNonNull(RecordType),
    args: { object: { type: new GraphQLNonNull(GraphQLString) }, data: { type: new GraphQLNonNull(JSONScalar) } },
    resolve: async (_r, { object, data }, ctx) => {
      requireRbac(ctx, "objects", "create");
      const obj = await requireObject(object);
      const result = await createRecord(obj.id, data ?? {}, { apiName: obj.apiName, actorId: ctx.auth.user?.id });
      if (!result.ok) throw new GraphQLError(result.error, { extensions: { code: "BAD_USER_INPUT" } });
      return { ...result.record, object };
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
      const result = await updateRecord(obj.id, id, data ?? {}, { apiName: obj.apiName, actorId: ctx.auth.user?.id });
      if (result === undefined) throw new GraphQLError("Record not found", { extensions: { code: "NOT_FOUND" } });
      if (!result.ok) throw new GraphQLError(result.error, { extensions: { code: "BAD_USER_INPUT" } });
      return { ...result.record, object };
    },
  },
  deleteRecord: {
    type: new GraphQLNonNull(GraphQLBoolean),
    args: { object: { type: new GraphQLNonNull(GraphQLString) }, id: { type: new GraphQLNonNull(GraphQLID) } },
    resolve: async (_r, { object, id }, ctx) => {
      requireRbac(ctx, "objects", "delete");
      const obj = await requireObject(object);
      return deleteRecord(obj.id, id, { apiName: obj.apiName, actorId: ctx.auth.user?.id });
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
