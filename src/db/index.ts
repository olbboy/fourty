import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT, industry TEXT, size TEXT,
  website TEXT, linkedin TEXT, city TEXT, country TEXT, annual_revenue REAL,
  owner_id TEXT, custom TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS companies_name_idx ON companies(name);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL DEFAULT '',
  email TEXT, phone TEXT, job_title TEXT, company_id TEXT, owner_id TEXT,
  status TEXT NOT NULL DEFAULT 'lead', source TEXT, score INTEGER NOT NULL DEFAULT 0,
  linkedin TEXT, city TEXT, country TEXT, custom TEXT NOT NULL DEFAULT '{}',
  last_activity_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts(email);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON contacts(company_id);
CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stages (
  id TEXT PRIMARY KEY, pipeline_id TEXT NOT NULL, name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, win_probability INTEGER NOT NULL DEFAULT 50,
  type TEXT NOT NULL DEFAULT 'open', color TEXT NOT NULL DEFAULT '#6366f1'
);
CREATE INDEX IF NOT EXISTS stages_pipeline_idx ON stages(pipeline_id);
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD', pipeline_id TEXT NOT NULL, stage_id TEXT NOT NULL,
  company_id TEXT, contact_id TEXT, owner_id TEXT, expected_close_date INTEGER,
  closed_at INTEGER, stage_entered_at INTEGER NOT NULL, custom TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS deals_stage_idx ON deals(stage_id);
CREATE INDEX IF NOT EXISTS deals_pipeline_idx ON deals(pipeline_id);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, due_date INTEGER,
  completed_at INTEGER, priority TEXT NOT NULL DEFAULT 'medium', owner_id TEXT,
  entity_type TEXT, entity_id TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_entity_idx ON tasks(entity_type, entity_id);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY, body TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, author_id TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_entity_idx ON notes(entity_type, entity_id);
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  actor_id TEXT, meta TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS activities_entity_idx ON activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS activities_created_idx ON activities(created_at);
CREATE TABLE IF NOT EXISTS custom_field_defs (
  id TEXT PRIMARY KEY, entity TEXT NOT NULL, key TEXT NOT NULL, label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text', options TEXT NOT NULL DEFAULT '[]',
  required INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  trigger TEXT NOT NULL, conditions TEXT NOT NULL DEFAULT '[]', actions TEXT NOT NULL DEFAULT '[]',
  run_count INTEGER NOT NULL DEFAULT 0, last_run_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  status TEXT NOT NULL, log TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS workflow_runs_wf_idx ON workflow_runs(workflow_id);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, prefix TEXT NOT NULL, key_hash TEXT NOT NULL,
  last_used_at INTEGER, revoked_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY, entity TEXT NOT NULL, name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}', user_id TEXT, created_at INTEGER NOT NULL
);
`;

function createDb(): BetterSQLite3Database<typeof schema> {
  const dbPath = process.env.FOURTY_DB_PATH ?? path.join(process.cwd(), "data", "fourty.db");
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Wait for a contended write lock instead of failing immediately. During
  // `next build`, page-data collection imports every route in parallel worker
  // processes that each open this file and run the DDL below; without a busy
  // timeout the concurrent writers race and throw SQLITE_BUSY.
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}

// Survive Next.js dev-mode HMR without leaking connections
const globalForDb = globalThis as unknown as { __fourtyDb?: BetterSQLite3Database<typeof schema> };

export const db = globalForDb.__fourtyDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__fourtyDb = db;

export * as tables from "./schema";
