import pg from "pg";
import { runMigrations } from "@/db/migrate";

/**
 * Test-database lifecycle for the Postgres port.
 *
 * Vitest sets DATABASE_URL to the `fourty_test` database (see vitest.config.ts),
 * so every DB-touching test runs against real Postgres — not an emulator (per
 * the Direction B mission). `resetDb()` migrates once, then truncates all data
 * so each test file starts from a clean slate. Test files run sequentially
 * (`fileParallelism: false`) so truncation never races across files.
 */
const TEST_DSN =
  process.env.DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty_test";

let migrated = false;

export async function resetDb(): Promise<void> {
  if (!migrated) {
    await runMigrations(TEST_DSN);
    migrated = true;
  }
  const client = new pg.Client({ connectionString: TEST_DSN });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    if (rows.length > 0) {
      const list = rows.map((r) => `"${r.tablename}"`).join(", ");
      await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}
