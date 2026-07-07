import { describe, it, expect } from "vitest";
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * Migration reversibility (Gate B1): apply the migration → capture a schema
 * checksum → roll it back (down) → assert the schema is gone → re-apply →
 * assert the checksum is byte-identical. Proves up/down migrations are
 * reversible and deterministic (ADR-002).
 *
 * Runs the SQL files directly (not through the migrator's bookkeeping) so it can
 * freely apply/rollback/re-apply on a dedicated connection.
 */
const DSN =
  process.env.DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty_test";

function statements(file: string): string[] {
  const sql = readFileSync(path.join(process.cwd(), file), "utf8");
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function exec(client: pg.Client, file: string) {
  for (const stmt of statements(file)) {
    await client.query(stmt);
  }
}

async function schemaFingerprint(client: pg.Client): Promise<string> {
  const { rows } = await client.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
  );
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function publicTableCount(client: pg.Client): Promise<number> {
  const { rows } = await client.query(
    "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'",
  );
  return rows[0].n;
}

describe("migration reversibility (real Postgres)", () => {
  it("apply → checksum → rollback → re-apply yields an identical schema", async () => {
    const client = new pg.Client({ connectionString: DSN });
    await client.connect();
    try {
      // Clean slate (a prior migrator run may have created the tables).
      await exec(client, "drizzle/down/0000_init.down.sql");
      expect(await publicTableCount(client)).toBe(0);

      // Apply up → fingerprint A
      await exec(client, "drizzle/0000_init.sql");
      const before = await schemaFingerprint(client);
      expect(await publicTableCount(client)).toBe(16);

      // Roll back one step → schema gone
      await exec(client, "drizzle/down/0000_init.down.sql");
      expect(await publicTableCount(client)).toBe(0);

      // Re-apply → fingerprint B, must equal A
      await exec(client, "drizzle/0000_init.sql");
      const after = await schemaFingerprint(client);
      expect(await publicTableCount(client)).toBe(16);
      expect(after).toBe(before);
    } finally {
      await client.end();
    }
  });
});
