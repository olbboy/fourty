import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// ── Auth ────────────────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"), // admin | member
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // random token
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ── Core CRM objects ────────────────────────────────────────────────────────

export const companies = sqliteTable(
  "companies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    domain: text("domain"),
    industry: text("industry"),
    size: text("size"), // e.g. "1-10", "11-50", ...
    website: text("website"),
    linkedin: text("linkedin"),
    city: text("city"),
    country: text("country"),
    annualRevenue: real("annual_revenue"),
    ownerId: text("owner_id"),
    custom: text("custom").notNull().default("{}"), // JSON: custom field values
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("companies_name_idx").on(t.name)],
);

export const contacts = sqliteTable(
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
    status: text("status").notNull().default("lead"), // lead | qualified | customer | churned
    source: text("source"), // website | referral | outbound | event | other
    score: integer("score").notNull().default(0), // auto lead score 0-100
    linkedin: text("linkedin"),
    city: text("city"),
    country: text("country"),
    custom: text("custom").notNull().default("{}"),
    lastActivityAt: integer("last_activity_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("contacts_email_idx").on(t.email),
    index("contacts_company_idx").on(t.companyId),
  ],
);

export const pipelines = sqliteTable("pipelines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: integer("is_default").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const stages = sqliteTable(
  "stages",
  {
    id: text("id").primaryKey(),
    pipelineId: text("pipeline_id").notNull(),
    name: text("name").notNull(),
    order: integer("sort_order").notNull().default(0),
    winProbability: integer("win_probability").notNull().default(50), // 0-100
    type: text("type").notNull().default("open"), // open | won | lost
    color: text("color").notNull().default("#6366f1"),
  },
  (t) => [index("stages_pipeline_idx").on(t.pipelineId)],
);

export const deals = sqliteTable(
  "deals",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    amount: real("amount").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    pipelineId: text("pipeline_id").notNull(),
    stageId: text("stage_id").notNull(),
    companyId: text("company_id"),
    contactId: text("contact_id"),
    ownerId: text("owner_id"),
    expectedCloseDate: integer("expected_close_date"),
    closedAt: integer("closed_at"),
    stageEnteredAt: integer("stage_entered_at").notNull(), // for pipeline velocity
    custom: text("custom").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("deals_stage_idx").on(t.stageId),
    index("deals_pipeline_idx").on(t.pipelineId),
  ],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: integer("due_date"),
    completedAt: integer("completed_at"),
    priority: text("priority").notNull().default("medium"), // low | medium | high
    ownerId: text("owner_id"),
    entityType: text("entity_type"), // contact | company | deal | null
    entityId: text("entity_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("tasks_entity_idx").on(t.entityType, t.entityId)],
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    body: text("body").notNull(),
    entityType: text("entity_type").notNull(), // contact | company | deal
    entityId: text("entity_id").notNull(),
    authorId: text("author_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("notes_entity_idx").on(t.entityType, t.entityId)],
);

// Timeline events — every meaningful change lands here
export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(), // created | updated | stage_changed | note_added | task_completed | email | call | meeting | workflow
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    actorId: text("actor_id"),
    meta: text("meta").notNull().default("{}"), // JSON details
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("activities_entity_idx").on(t.entityType, t.entityId),
    index("activities_created_idx").on(t.createdAt),
  ],
);

// ── Extensibility ───────────────────────────────────────────────────────────

export const customFieldDefs = sqliteTable("custom_field_defs", {
  id: text("id").primaryKey(),
  entity: text("entity").notNull(), // contact | company | deal
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: text("type").notNull().default("text"), // text | number | date | select | checkbox | url
  options: text("options").notNull().default("[]"), // JSON array for select
  required: integer("required").notNull().default(0),
  order: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  enabled: integer("enabled").notNull().default(1),
  trigger: text("trigger").notNull(), // JSON: { event, entity }
  conditions: text("conditions").notNull().default("[]"), // JSON: [{field, op, value}]
  actions: text("actions").notNull().default("[]"), // JSON: [{type, ...params}]
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: integer("last_run_at"),
  createdAt: integer("created_at").notNull(),
});

export const workflowRuns = sqliteTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    status: text("status").notNull(), // success | skipped | error
    log: text("log").notNull().default("[]"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("workflow_runs_wf_idx").on(t.workflowId)],
);

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(), // first 8 chars, shown in UI
  keyHash: text("key_hash").notNull(),
  lastUsedAt: integer("last_used_at"),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const savedViews = sqliteTable("saved_views", {
  id: text("id").primaryKey(),
  entity: text("entity").notNull(), // contact | company | deal
  name: text("name").notNull(),
  config: text("config").notNull().default("{}"), // JSON: {search, filters, sort}
  userId: text("user_id"),
  createdAt: integer("created_at").notNull(),
});
