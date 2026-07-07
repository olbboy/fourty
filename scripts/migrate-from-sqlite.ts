/**
 * migrate-from-sqlite — move an existing Fourty SQLite database to Postgres.
 *
 * The Postgres schema (src/db/schema.ts) preserves the exact table and column
 * names and value semantics of the old SQLite schema (ADR-003), so migration is
 * a faithful table-by-table copy. Run AFTER `npm run db:migrate` has created the
 * Postgres schema.
 *
 *   DATABASE_URL=postgres://…  npm run migrate-from-sqlite -- --sqlite ./data/fourty.db
 *   …                                                          --dry-run   (report only)
 *
 * Data safety: existing user data is inviolable. --dry-run reports exactly what
 * would move (per-table counts) without writing. The round-trip test in
 * tests/migrate-from-sqlite.test.ts proves counts + field values survive.
 */
import Database from "better-sqlite3";
import pg from "pg";

// Order chosen so any future FK constraints would be satisfied; today there are
// no FK constraints in the Postgres schema, so order is not load-bearing.
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

export type MigrationReport = {
  perTable: Record<string, { read: number; inserted: number }>;
  totalRead: number;
  totalInserted: number;
  dryRun: boolean;
};

export async function migrateFromSqlite(opts: {
  sqlitePath: string;
  pgUrl?: string;
  dryRun?: boolean;
}): Promise<MigrationReport> {
  const pgUrl = opts.pgUrl ?? process.env.DATABASE_URL;
  if (!pgUrl) throw new Error("DATABASE_URL (or opts.pgUrl) is required");

  const sqlite = new Database(opts.sqlitePath, { readonly: true, fileMustExist: true });
  const pool = new pg.Pool({ connectionString: pgUrl });
  const report: MigrationReport = {
    perTable: {},
    totalRead: 0,
    totalInserted: 0,
    dryRun: !!opts.dryRun,
  };

  try {
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
          for (const row of rows) {
            const cols = Object.keys(row);
            const colList = cols.map((c) => `"${c}"`).join(", ");
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
            const values = cols.map((c) => row[c]);
            // ON CONFLICT DO NOTHING → re-runnable; a pre-existing row is a skip,
            // surfaced in the report (read vs inserted) rather than a silent loss.
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
  } finally {
    sqlite.close();
    await pool.end();
  }

  return report;
}

function parseArgs(argv: string[]) {
  const out: { sqlite?: string; dryRun: boolean } = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sqlite") out.sqlite = argv[++i];
    else if (argv[i] === "--dry-run") out.dryRun = true;
  }
  return out;
}

const invokedDirectly = process.argv[1]?.endsWith("migrate-from-sqlite.ts");
if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sqlite) {
    console.error("usage: migrate-from-sqlite --sqlite <path> [--dry-run]");
    process.exit(2);
  }
  migrateFromSqlite({ sqlitePath: args.sqlite, dryRun: args.dryRun })
    .then((r) => {
      console.log(r.dryRun ? "DRY RUN — no data written\n" : "Migration complete\n");
      for (const [t, c] of Object.entries(r.perTable)) {
        console.log(`  ${t.padEnd(20)} read ${c.read}  inserted ${c.inserted}`);
      }
      console.log(`\n  total: read ${r.totalRead}, inserted ${r.totalInserted}`);
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
