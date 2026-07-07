/**
 * migrate-from-sqlite — move an existing single-tenant Fourty SQLite database
 * into one workspace of the Postgres multi-tenant schema (ADR-001/003).
 *
 * The Postgres schema preserves the old table/column names, so migration is a
 * faithful copy — plus a target workspace: all rows land in it, all migrated
 * users become its members, and app.workspace_id is set so RLS WITH CHECK
 * passes and workspace_id columns auto-populate.
 *
 *   DATABASE_URL=postgres://…  npm run migrate-from-sqlite -- --sqlite ./data/fourty.db
 *   …                                                          --dry-run   (report only)
 *
 * Run AFTER `npm run db:migrate` creates the Postgres schema. --dry-run reports
 * what would move without writing. Round-trip tested in
 * tests/migrate-from-sqlite.test.ts.
 */
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import pg from "pg";

const rid = () => randomBytes(12).toString("hex");

// Copy order (no FK constraints today, so order is not load-bearing).
export const MIGRATED_TABLES = [
  "users",
  "sessions",
  "pipelines",
  "stages",
  "companies",
  "contacts",
  "deals",
  "tasks",
  "notes",
  "activities",
  "custom_field_defs",
  "workflows",
  "workflow_runs",
  "api_keys",
  "settings",
  "saved_views",
] as const;

// Tables the app scopes by workspace_id (RLS or app-scoped) — inserts need the
// GUC set so the column default resolves and RLS WITH CHECK passes.
const SCOPED = new Set([
  "pipelines",
  "stages",
  "companies",
  "contacts",
  "deals",
  "tasks",
  "notes",
  "activities",
  "custom_field_defs",
  "workflows",
  "workflow_runs",
  "api_keys",
  "saved_views",
]);

export type MigrationReport = {
  workspaceId: string;
  perTable: Record<string, { read: number; inserted: number }>;
  totalRead: number;
  totalInserted: number;
  memberships: number;
  dryRun: boolean;
};

export async function migrateFromSqlite(opts: {
  sqlitePath: string;
  pgUrl?: string;
  dryRun?: boolean;
  workspaceId?: string;
  workspaceName?: string;
}): Promise<MigrationReport> {
  const pgUrl = opts.pgUrl ?? process.env.DATABASE_URL;
  if (!pgUrl) throw new Error("DATABASE_URL (or opts.pgUrl) is required");

  const workspaceId = opts.workspaceId ?? rid();
  const sqlite = new Database(opts.sqlitePath, { readonly: true, fileMustExist: true });
  const pool = new pg.Pool({ connectionString: pgUrl });
  const report: MigrationReport = {
    workspaceId,
    perTable: {},
    totalRead: 0,
    totalInserted: 0,
    memberships: 0,
    dryRun: !!opts.dryRun,
  };

  try {
    if (!opts.dryRun) {
      // Ensure the target workspace exists.
      const c = await pool.connect();
      try {
        await c.query(
          "INSERT INTO workspaces (id,name,slug,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
          [workspaceId, opts.workspaceName ?? "Imported", `imported-${workspaceId.slice(0, 8)}`, Date.now()],
        );
      } finally {
        c.release();
      }
    }

    for (const table of MIGRATED_TABLES) {
      const exists = sqlite
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      if (!exists) continue;

      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
      let inserted = 0;

      if (!opts.dryRun && rows.length > 0) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          if (SCOPED.has(table)) {
            await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
          }
          for (const row of rows) {
            const cols = Object.keys(row);
            const colList = cols.map((c) => `"${c}"`).join(", ");
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
            const values = cols.map((c) => row[c]);
            const res = await client.query(
              `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
              values,
            );
            inserted += res.rowCount ?? 0;
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }

      report.perTable[table] = { read: rows.length, inserted };
      report.totalRead += rows.length;
      report.totalInserted += inserted;
    }

    // Make every migrated user a member of the target workspace (they were the
    // sole users of the single-tenant instance → admins).
    if (!opts.dryRun) {
      const userRows = sqlite.prepare("SELECT id FROM users").all() as { id: string }[];
      const client = await pool.connect();
      try {
        for (const u of userRows) {
          const res = await client.query(
            `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
             VALUES ($1,$2,$3,'admin',$4) ON CONFLICT (workspace_id, user_id) DO NOTHING`,
            [rid(), workspaceId, u.id, Date.now()],
          );
          report.memberships += res.rowCount ?? 0;
        }
      } finally {
        client.release();
      }
    }
  } finally {
    sqlite.close();
    await pool.end();
  }

  return report;
}

function parseArgs(argv: string[]) {
  const out: { sqlite?: string; dryRun: boolean; workspace?: string } = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sqlite") out.sqlite = argv[++i];
    else if (argv[i] === "--dry-run") out.dryRun = true;
    else if (argv[i] === "--workspace") out.workspace = argv[++i];
  }
  return out;
}

const invokedDirectly = process.argv[1]?.endsWith("migrate-from-sqlite.ts");
if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sqlite) {
    console.error("usage: migrate-from-sqlite --sqlite <path> [--dry-run] [--workspace <id>]");
    process.exit(2);
  }
  migrateFromSqlite({ sqlitePath: args.sqlite, dryRun: args.dryRun, workspaceId: args.workspace })
    .then((r) => {
      console.log(r.dryRun ? "DRY RUN — no data written\n" : `Migration complete → workspace ${r.workspaceId}\n`);
      for (const [t, c] of Object.entries(r.perTable)) {
        console.log(`  ${t.padEnd(20)} read ${c.read}  inserted ${c.inserted}`);
      }
      console.log(`\n  total: read ${r.totalRead}, inserted ${r.totalInserted}, memberships ${r.memberships}`);
      const skipped = r.totalRead - r.totalInserted;
      if (!r.dryRun && skipped > 0) {
        console.log(`  note: ${skipped} row(s) already present (ON CONFLICT skip) — no data lost`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("migration failed:", err);
      process.exit(1);
    });
}
