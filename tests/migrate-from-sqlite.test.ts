import { beforeAll, afterAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resetDb } from "./pg-setup";
import { migrateFromSqlite } from "../scripts/migrate-from-sqlite";

/**
 * Round-trip: seed a legacy single-tenant SQLite database (old schema), migrate
 * it into one workspace of the Postgres multi-tenant schema, and assert
 * per-table counts and field values survive under RLS. Proves ADR-003 — no data
 * is stranded by the drop of SQLite.
 */
const LEGACY_DDL = `
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL);
CREATE TABLE pipelines (id TEXT PRIMARY KEY, name TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE stages (id TEXT PRIMARY KEY, pipeline_id TEXT NOT NULL, name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, win_probability INTEGER NOT NULL DEFAULT 50,
  type TEXT NOT NULL DEFAULT 'open', color TEXT NOT NULL DEFAULT '#6366f1');
CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT, industry TEXT, size TEXT,
  website TEXT, linkedin TEXT, city TEXT, country TEXT, annual_revenue REAL,
  owner_id TEXT, custom TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE contacts (id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL DEFAULT '',
  email TEXT, phone TEXT, job_title TEXT, company_id TEXT, owner_id TEXT,
  status TEXT NOT NULL DEFAULT 'lead', source TEXT, score INTEGER NOT NULL DEFAULT 0,
  linkedin TEXT, city TEXT, country TEXT, custom TEXT NOT NULL DEFAULT '{}',
  last_activity_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE deals (id TEXT PRIMARY KEY, name TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD', pipeline_id TEXT NOT NULL, stage_id TEXT NOT NULL,
  company_id TEXT, contact_id TEXT, owner_id TEXT, expected_close_date INTEGER,
  closed_at INTEGER, stage_entered_at INTEGER NOT NULL, custom TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE activities (id TEXT PRIMARY KEY, type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  actor_id TEXT, meta TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
`;

describe("migrate-from-sqlite round-trip", () => {
  let tmp: string;
  let sqlitePath: string;
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let migratedWs: string;

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));

    tmp = mkdtempSync(path.join(tmpdir(), "fourty-sqlite-"));
    sqlitePath = path.join(tmp, "legacy.db");
    const s = new Database(sqlitePath);
    s.exec(LEGACY_DDL);
    const now = Date.now();
    s.prepare(
      "INSERT INTO users (id,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?)",
    ).run("u1", "boss@acme.co", "Boss", "salt:hash", "admin", now);
    s.prepare("INSERT INTO pipelines (id,name,is_default,created_at) VALUES (?,?,?,?)").run(
      "p1",
      "Sales",
      1,
      now,
    );
    s.prepare(
      "INSERT INTO stages (id,pipeline_id,name,sort_order,win_probability,type,color) VALUES (?,?,?,?,?,?,?)",
    ).run("s1", "p1", "Lead", 0, 10, "open", "#94a3b8");
    s.prepare(
      "INSERT INTO companies (id,name,domain,annual_revenue,custom,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    ).run("co1", "Acme", "acme.co", 1000000.5, '{"tier":"gold"}', now, now);
    for (let i = 0; i < 3; i++) {
      s.prepare(
        "INSERT INTO contacts (id,first_name,last_name,email,company_id,status,score,custom,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      ).run(`c${i}`, `First${i}`, "Last", `c${i}@acme.co`, "co1", "lead", 42 + i, "{}", now, now);
    }
    s.prepare(
      "INSERT INTO deals (id,name,amount,currency,pipeline_id,stage_id,company_id,stage_entered_at,custom,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run("d1", "Big deal", 250000.25, "EUR", "p1", "s1", "co1", now, "{}", now, now);
    s.prepare(
      "INSERT INTO activities (id,type,entity_type,entity_id,meta,created_at) VALUES (?,?,?,?,?,?)",
    ).run("a1", "call", "contact", "c0", "{}", now);
    s.close();
  });

  afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it("dry-run reports counts without writing", async () => {
    const report = await migrateFromSqlite({ sqlitePath, dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.perTable.contacts.read).toBe(3);
    expect(report.totalInserted).toBe(0);
    expect((await db.select().from(tables.workspaces)).length).toBe(0); // nothing written
  });

  it("migrates every table into a workspace with matching row counts", async () => {
    const report = await migrateFromSqlite({ sqlitePath });
    migratedWs = report.workspaceId;
    expect(report.perTable.users).toEqual({ read: 1, inserted: 1 });
    expect(report.perTable.contacts).toEqual({ read: 3, inserted: 3 });
    expect(report.perTable.deals).toEqual({ read: 1, inserted: 1 });
    expect(report.memberships).toBe(1); // the one user became a member

    // Global tables (not RLS):
    expect((await db.select().from(tables.users)).length).toBe(1);
    // Workspace-scoped data is visible only inside the target workspace:
    await withWorkspace(migratedWs, async () => {
      expect((await db.select().from(tables.contacts)).length).toBe(3);
      expect((await db.select().from(tables.companies)).length).toBe(1);
      expect((await db.select().from(tables.deals)).length).toBe(1);
      expect((await db.select().from(tables.activities)).length).toBe(1);
    });
  });

  it("preserves field values and types across the migration", async () => {
    await withWorkspace(migratedWs, async () => {
      const company = (await db.select().from(tables.companies))[0];
      expect(company.name).toBe("Acme");
      expect(company.annualRevenue).toBe(1000000.5); // real → double precision
      expect(JSON.parse(company.custom)).toEqual({ tier: "gold" }); // JSON text preserved
      expect(company.workspaceId).toBe(migratedWs); // scoped to the target workspace

      const deal = (await db.select().from(tables.deals))[0];
      expect(deal.amount).toBe(250000.25);
      expect(deal.currency).toBe("EUR");

      const contacts = await db.select().from(tables.contacts);
      const c1 = contacts.find((c) => c.id === "c1")!;
      expect(c1.email).toBe("c1@acme.co");
      expect(c1.score).toBe(43); // integer preserved
      expect(typeof c1.createdAt).toBe("number"); // bigint → number
    });
  });

  it("is re-runnable into the same workspace — inserts nothing (ON CONFLICT skip)", async () => {
    const report = await migrateFromSqlite({ sqlitePath, workspaceId: migratedWs });
    expect(report.totalRead).toBeGreaterThan(0);
    expect(report.totalInserted).toBe(0); // all already present
    await withWorkspace(migratedWs, async () => {
      expect((await db.select().from(tables.contacts)).length).toBe(3);
    });
  });
});
