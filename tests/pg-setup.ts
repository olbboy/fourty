import pg from "pg";
import { runMigrations } from "@/db/migrate";

/**
 * Test-database lifecycle for the Postgres + RLS port.
 *
 * - Migrations + truncation run as the OWNER role (`fourty`).
 * - The app/query pool (@/db) connects as `fourty_app` (RLS-subject), set via
 *   DATABASE_URL in vitest.config.ts — so tests exercise the real RLS path.
 *
 * `resetDb()` migrates once, then truncates all data so each test file starts
 * clean. Files run sequentially (fileParallelism: false), so no truncation race.
 */
const OWNER_DSN =
  process.env.MIGRATE_DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty_test";

let migrated = false;

export async function resetDb(): Promise<void> {
  if (!migrated) {
    await runMigrations(OWNER_DSN);
    migrated = true;
  }
  const client = new pg.Client({ connectionString: OWNER_DSN });
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

/** Create a workspace (+ optional owner membership) for a test. Returns its id. */
export async function createWorkspace(opts?: {
  id?: string;
  name?: string;
  slug?: string;
}): Promise<string> {
  const { db, tables } = await import("@/db");
  const { newId } = await import("@/lib/id");
  const id = opts?.id ?? newId();
  await db.insert(tables.workspaces).values({
    id,
    name: opts?.name ?? `WS ${id}`,
    slug: opts?.slug ?? `ws-${id.toLowerCase()}`,
    createdAt: Date.now(),
  });
  return id;
}
