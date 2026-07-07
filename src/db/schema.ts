import { pgTable, text, integer, bigint, doublePrecision, index } from "drizzle-orm/pg-core";

// Value semantics preserved from the SQLite original so application logic
// (Date.now() epoch millis, 0/1 boolean flags, JSON-in-text) is unchanged by
// the Postgres port (ADR-002/006):
//   - epoch-millis timestamps → bigint({ mode: "number" })  (fits in 2^53)
//   - boolean flags           → integer 0/1
//   - JSON blobs              → text (JSON.parse/stringify at the edge)
// Multi-tenancy (workspace_id) and jsonb/native-timestamp migrations come in
// later gates; B1 is a faithful single-tenant port onto Postgres.

const millis = (name: string) => bigint(name, { mode: "number" });

// ── Auth ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"), // admin | member
  createdAt: millis("created_at").notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the random token
  userId: text("user_id").notNull(),
  expiresAt: millis("expires_at").notNull(),
  createdAt: millis("created_at").notNull(),
});

// ── Core CRM objects ────────────────────────────────────────────────────────

export const companies = pgTable(
  "companies",
  {
    id: text("id").primaryKey(),
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
  (t) => [index("companies_name_idx").on(t.name)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
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
    index("contacts_email_idx").on(t.email),
    index("contacts_company_idx").on(t.companyId),
  ],
);

export const pipelines = pgTable("pipelines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: integer("is_default").notNull().default(0),
  createdAt: millis("created_at").notNull(),
});

export const stages = pgTable(
  "stages",
  {
    id: text("id").primaryKey(),
    pipelineId: text("pipeline_id").notNull(),
    name: text("name").notNull(),
    order: integer("sort_order").notNull().default(0),
    winProbability: integer("win_probability").notNull().default(50),
    type: text("type").notNull().default("open"), // open | won | lost
    color: text("color").notNull().default("#6366f1"),
  },
  (t) => [index("stages_pipeline_idx").on(t.pipelineId)],
);

export const deals = pgTable(
  "deals",
  {
    id: text("id").primaryKey(),
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
    index("deals_stage_idx").on(t.stageId),
    index("deals_pipeline_idx").on(t.pipelineId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
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
  (t) => [index("tasks_entity_idx").on(t.entityType, t.entityId)],
);

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    body: text("body").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    authorId: text("author_id"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [index("notes_entity_idx").on(t.entityType, t.entityId)],
);

export const activities = pgTable(
  "activities",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    actorId: text("actor_id"),
    meta: text("meta").notNull().default("{}"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [
    index("activities_entity_idx").on(t.entityType, t.entityId),
    index("activities_created_idx").on(t.createdAt),
  ],
);

// ── Extensibility ───────────────────────────────────────────────────────────

export const customFieldDefs = pgTable("custom_field_defs", {
  id: text("id").primaryKey(),
  entity: text("entity").notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull().default("text"),
  options: text("options").notNull().default("[]"),
  required: integer("required").notNull().default(0),
  order: integer("sort_order").notNull().default(0),
  createdAt: millis("created_at").notNull(),
});

export const workflows = pgTable("workflows", {
  id: text("id").primaryKey(),
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
    workflowId: text("workflow_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    status: text("status").notNull(),
    log: text("log").notNull().default("[]"),
    createdAt: millis("created_at").notNull(),
  },
  (t) => [index("workflow_runs_wf_idx").on(t.workflowId)],
);

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  lastUsedAt: millis("last_used_at"),
  revokedAt: millis("revoked_at"),
  createdAt: millis("created_at").notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const savedViews = pgTable("saved_views", {
  id: text("id").primaryKey(),
  entity: text("entity").notNull(),
  name: text("name").notNull(),
  config: text("config").notNull().default("{}"),
  userId: text("user_id"),
  createdAt: millis("created_at").notNull(),
});
