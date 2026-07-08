import {
  pgTable,
  text,
  integer,
  bigint,
  doublePrecision,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Value semantics preserved from the SQLite original (epoch-millis→bigint,
// 0/1 flags→integer, JSON→text). Multi-tenancy (B2): every CRM table carries
// workspace_id, which DEFAULTS to the per-transaction GUC set by withWorkspace()
// — so inserts auto-populate it and Postgres RLS enforces isolation. See
// docs/adr/001-tenancy-model.md.

const millis = (name: string) => bigint(name, { mode: "number" });

// workspace_id column shared by every tenant-scoped table. NOT NULL + a DB
// default of current_setting('app.workspace_id') means an insert without an
// active workspace fails closed (default resolves to NULL → NOT NULL violation).
const workspaceId = () =>
  text("workspace_id")
    .notNull()
    .default(sql`current_setting('app.workspace_id', true)`);

// ── Tenancy ───────────────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: millis("created_at").notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("member"), // admin | member | viewer
    deactivatedAt: millis("deactivated_at"), // soft-remove: keeps history, blocks access
    createdAt: millis("created_at").notNull(),
  },
  (t) => [
    index("workspace_members_ws_idx").on(t.workspaceId),
    index("workspace_members_user_idx").on(t.userId),
    uniqueIndex("workspace_members_unique").on(t.workspaceId, t.userId),
  ],
);

// Pending invitations to join a workspace (tenant-scoped, RLS-enforced).
export const invites = pgTable(
  "invites",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"), // role granted on accept
    tokenHash: text("token_hash").notNull(), // sha256 of the invite token
    expiresAt: millis("expires_at").notNull(),
    acceptedAt: millis("accepted_at"),
    invitedBy: text("invited_by"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [
    index("invites_ws_idx").on(t.workspaceId),
    index("invites_email_idx").on(t.workspaceId, t.email),
  ],
);

// Immutable audit trail (tenant-scoped). RLS + FORCE, and 0004 REVOKEs
// UPDATE/DELETE + adds DO-INSTEAD-NOTHING rules so history cannot be rewritten.
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    actorId: text("actor_id"),
    action: text("action").notNull(), // e.g. contact.created, member.role_changed, api_key.revoked
    objectType: text("object_type"),
    objectId: text("object_id"),
    meta: text("meta").notNull().default("{}"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [
    index("audit_log_ws_idx").on(t.workspaceId, t.createdAt),
    index("audit_log_object_idx").on(t.workspaceId, t.objectType, t.objectId),
  ],
);

// ── Auth (global identity — NOT workspace-scoped) ───────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"), // legacy global role; authz lives on membership
  createdAt: millis("created_at").notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the random token
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id"), // active workspace for this session (nullable pre-selection)
  expiresAt: millis("expires_at").notNull(),
  createdAt: millis("created_at").notNull(),
});

// ── Core CRM objects (workspace-scoped + RLS) ───────────────────────────────

export const companies = pgTable(
  "companies",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    domain: text("domain"),
    industry: text("industry"),
    size: text("size"),
    website: text("website"),
    linkedin: text("linkedin"),
    city: text("city"),
    country: text("country"),
    annualRevenue: doublePrecision("annual_revenue"),
    ownerId: text("owner_id"),
    custom: text("custom").notNull().default("{}"),
    createdAt: millis("created_at").notNull(),
    updatedAt: millis("updated_at").notNull(),
  },
  (t) => [
    index("companies_ws_name_idx").on(t.workspaceId, t.name),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    email: text("email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    companyId: text("company_id"),
    ownerId: text("owner_id"),
    status: text("status").notNull().default("lead"),
    source: text("source"),
    score: integer("score").notNull().default(0),
    linkedin: text("linkedin"),
    city: text("city"),
    country: text("country"),
    custom: text("custom").notNull().default("{}"),
    lastActivityAt: millis("last_activity_at"),
    createdAt: millis("created_at").notNull(),
    updatedAt: millis("updated_at").notNull(),
  },
  (t) => [
    index("contacts_ws_email_idx").on(t.workspaceId, t.email),
    index("contacts_ws_company_idx").on(t.workspaceId, t.companyId),
  ],
);

export const pipelines = pgTable("pipelines", {
  id: text("id").primaryKey(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  isDefault: integer("is_default").notNull().default(0),
  createdAt: millis("created_at").notNull(),
});

export const stages = pgTable(
  "stages",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    pipelineId: text("pipeline_id").notNull(),
    name: text("name").notNull(),
    order: integer("sort_order").notNull().default(0),
    winProbability: integer("win_probability").notNull().default(50),
    type: text("type").notNull().default("open"), // open | won | lost
    color: text("color").notNull().default("#6366f1"),
  },
  (t) => [index("stages_ws_pipeline_idx").on(t.workspaceId, t.pipelineId)],
);

export const deals = pgTable(
  "deals",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    amount: doublePrecision("amount").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    pipelineId: text("pipeline_id").notNull(),
    stageId: text("stage_id").notNull(),
    companyId: text("company_id"),
    contactId: text("contact_id"),
    ownerId: text("owner_id"),
    expectedCloseDate: millis("expected_close_date"),
    closedAt: millis("closed_at"),
    stageEnteredAt: millis("stage_entered_at").notNull(),
    custom: text("custom").notNull().default("{}"),
    createdAt: millis("created_at").notNull(),
    updatedAt: millis("updated_at").notNull(),
  },
  (t) => [
    index("deals_ws_stage_idx").on(t.workspaceId, t.stageId),
    index("deals_ws_pipeline_idx").on(t.workspaceId, t.pipelineId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: millis("due_date"),
    completedAt: millis("completed_at"),
    priority: text("priority").notNull().default("medium"),
    ownerId: text("owner_id"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [index("tasks_ws_entity_idx").on(t.workspaceId, t.entityType, t.entityId)],
);

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    body: text("body").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    authorId: text("author_id"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [index("notes_ws_entity_idx").on(t.workspaceId, t.entityType, t.entityId)],
);

export const activities = pgTable(
  "activities",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    actorId: text("actor_id"),
    meta: text("meta").notNull().default("{}"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [
    index("activities_ws_entity_idx").on(t.workspaceId, t.entityType, t.entityId),
    index("activities_ws_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

// ── Extensibility (workspace-scoped + RLS) ──────────────────────────────────

export const customFieldDefs = pgTable("custom_field_defs", {
  id: text("id").primaryKey(),
  workspaceId: workspaceId(),
  entity: text("entity").notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull().default("text"),
  options: text("options").notNull().default("[]"),
  required: integer("required").notNull().default(0),
  order: integer("sort_order").notNull().default(0),
  createdAt: millis("created_at").notNull(),
});

// Custom objects (no-code, Gate C1). A workspace defines its own object types
// (e.g. "Project", "Ticket") without DDL: definitions live in custom_objects,
// their fields in custom_object_fields, and every record is one row in
// custom_records with its values in a JSON `data` column. Metadata-driven keeps
// it RLS-scoped and reversible in a single migration (ADR-007).
export const customObjects = pgTable(
  "custom_objects",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    apiName: text("api_name").notNull(), // url/graphql slug, unique per workspace
    nameSingular: text("name_singular").notNull(),
    namePlural: text("name_plural").notNull(),
    icon: text("icon").notNull().default("Box"),
    description: text("description"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [uniqueIndex("custom_objects_ws_apiname_idx").on(t.workspaceId, t.apiName)],
);

export const customObjectFields = pgTable(
  "custom_object_fields",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    objectId: text("object_id").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type").notNull().default("text"), // text|number|date|select|checkbox|url
    options: text("options").notNull().default("[]"),
    required: integer("required").notNull().default(0),
    order: integer("sort_order").notNull().default(0),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [index("custom_object_fields_ws_object_idx").on(t.workspaceId, t.objectId)],
);

export const customRecords = pgTable(
  "custom_records",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    objectId: text("object_id").notNull(),
    data: text("data").notNull().default("{}"),
    createdAt: millis("created_at").notNull(),
    updatedAt: millis("updated_at").notNull(),
  },
  (t) => [index("custom_records_ws_object_idx").on(t.workspaceId, t.objectId, t.updatedAt)],
);

export const workflows = pgTable("workflows", {
  id: text("id").primaryKey(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  enabled: integer("enabled").notNull().default(1),
  trigger: text("trigger").notNull(),
  conditions: text("conditions").notNull().default("[]"),
  actions: text("actions").notNull().default("[]"),
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: millis("last_run_at"),
  createdAt: millis("created_at").notNull(),
});

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    workflowId: text("workflow_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    status: text("status").notNull(),
    log: text("log").notNull().default("[]"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [index("workflow_runs_ws_wf_idx").on(t.workspaceId, t.workflowId)],
);

// API keys belong to one workspace. Looked up by hash during auth (before a
// workspace context exists), so this table is app-scoped, not RLS-enforced.
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  workspaceId: workspaceId(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  role: text("role").notNull().default("admin"), // RBAC role a key acts as (admin = back-compat)
  lastUsedAt: millis("last_used_at"),
  revokedAt: millis("revoked_at"),
  createdAt: millis("created_at").notNull(),
});

export const settings = pgTable(
  "settings",
  {
    workspaceId: workspaceId(),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.key] })],
);

export const savedViews = pgTable("saved_views", {
  id: text("id").primaryKey(),
  workspaceId: workspaceId(),
  entity: text("entity").notNull(),
  name: text("name").notNull(),
  config: text("config").notNull().default("{}"),
  userId: text("user_id"),
  createdAt: millis("created_at").notNull(),
});

// Email + calendar sync (Gate C6, ADR-009). A sync_account is a connected
// mailbox/calendar (IMAP, Gmail, Microsoft, or an ICS feed URL). Ingested
// messages/events are deduped by their provider id (Message-ID / ICS UID) and
// linked to a contact by matching a participant email within the workspace. All
// three tables are workspace-scoped + RLS. The provider transport (OAuth/IMAP
// fetch) is the injectable edge; parsing→matching→linking→storage is in-repo.
export const syncAccounts = pgTable(
  "sync_accounts",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    provider: text("provider").notNull(), // imap | google | microsoft | ics
    email: text("email").notNull(),
    label: text("label"),
    config: text("config").notNull().default("{}"), // provider connection details (JSON)
    status: text("status").notNull().default("active"), // active | paused | error
    lastSyncedAt: millis("last_synced_at"),
    lastError: text("last_error"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [index("sync_accounts_ws_idx").on(t.workspaceId)],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    accountId: text("account_id").notNull(),
    messageId: text("message_id").notNull(), // RFC 822 Message-ID (dedup key)
    threadId: text("thread_id"),
    direction: text("direction").notNull().default("inbound"), // inbound | outbound
    fromAddr: text("from_addr"),
    toAddrs: text("to_addrs").notNull().default("[]"),
    subject: text("subject"),
    snippet: text("snippet"),
    contactId: text("contact_id"),
    sentAt: millis("sent_at"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("email_messages_dedup_idx").on(t.workspaceId, t.accountId, t.messageId),
    index("email_messages_contact_idx").on(t.workspaceId, t.contactId),
  ],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id").primaryKey(),
    workspaceId: workspaceId(),
    accountId: text("account_id").notNull(),
    uid: text("uid").notNull(), // ICS UID (dedup key)
    title: text("title"),
    description: text("description"),
    location: text("location"),
    attendees: text("attendees").notNull().default("[]"),
    contactId: text("contact_id"),
    startAt: millis("start_at"),
    endAt: millis("end_at"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("calendar_events_dedup_idx").on(t.workspaceId, t.accountId, t.uid),
    index("calendar_events_contact_idx").on(t.workspaceId, t.contactId),
  ],
);

// Idempotency ledger for background jobs (Gate B4, ADR-004). A job handler
// claims its idempotency key here (INSERT … ON CONFLICT DO NOTHING) before doing
// side effects, so at-least-once delivery (a worker killed after the side effect
// but before ack → redelivery) still yields exactly-once results. Workspace-
// scoped + RLS: a job's receipt lives in the same tenant as its work.
export const jobReceipts = pgTable(
  "job_receipts",
  {
    workspaceId: workspaceId(),
    key: text("key").notNull(), // the job's idempotency key
    queue: text("queue").notNull(),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.key] })],
);
