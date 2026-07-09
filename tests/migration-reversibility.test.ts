import { describe, it, expect } from "vitest";
import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

/**
 * Migration reversibility (Gate B1, extended for B2/B3): apply the full
 * migration chain (0000 init → 0001 workspaces → 0002 RLS → 0003 rbac/members/
 * audit → 0004 audit RLS) → capture a schema checksum + policy count → roll the
 * whole chain back with the down files → assert an empty schema → re-apply →
 * assert byte-identical checksum. Proves up/down migrations are reversible and
 * deterministic (ADR-002).
 *
 * Runs on the dedicated `fourty_revtest` database (owner role) so it never
 * disturbs the migrator state of the shared test database.
 */
const DSN = "postgresql://fourty:fourty@localhost:5432/fourty_revtest";

const UP = [
  "drizzle/0000_init.sql",
  "drizzle/0001_workspaces.sql",
  "drizzle/0002_rls.sql",
  "drizzle/0003_rbac_members_audit.sql",
  "drizzle/0004_audit_rls.sql",
  "drizzle/0005_queue.sql",
  "drizzle/0006_custom_objects.sql",
  "drizzle/0007_email_calendar_sync.sql",
  "drizzle/0008_field_permissions.sql",
  "drizzle/0009_two_factor.sql",
  "drizzle/0010_sso_oidc.sql",
  "drizzle/0011_ai_chat.sql",
];
const DOWN = [
  "drizzle/down/0011_ai_chat.down.sql",
  "drizzle/down/0010_sso_oidc.down.sql",
  "drizzle/down/0009_two_factor.down.sql",
  "drizzle/down/0008_field_permissions.down.sql",
  "drizzle/down/0007_email_calendar_sync.down.sql",
  "drizzle/down/0006_custom_objects.down.sql",
  "drizzle/down/0005_queue.down.sql",
  "drizzle/down/0004_audit_rls.down.sql",
  "drizzle/down/0003_rbac_members_audit.down.sql",
  "drizzle/down/0002_rls.down.sql",
  "drizzle/down/0001_workspaces.down.sql",
  "drizzle/down/0000_init.down.sql",
];

function statements(file: string): string[] {
  return readFileSync(path.join(process.cwd(), file), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runFiles(client: pg.Client, files: string[]) {
  for (const f of files) for (const stmt of statements(f)) await client.query(stmt);
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

async function counts(client: pg.Client) {
  const t = await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'");
  const p = await client.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public'");
  return { tables: t.rows[0].n as number, policies: p.rows[0].n as number };
}

async function dropAll(client: pg.Client) {
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'",
  );
  for (const r of rows) await client.query(`DROP TABLE IF EXISTS "${r.tablename}" CASCADE`);
}

describe("migration reversibility (full chain, real Postgres)", () => {
  it("up → checksum → down → re-apply yields an identical schema", async () => {
    const client = new pg.Client({ connectionString: DSN });
    await client.connect();
    try {
      await dropAll(client); // clean slate regardless of prior state
      expect((await counts(client)).tables).toBe(0);

      // Apply the full chain → fingerprint A
      await runFiles(client, UP);
      const before = await schemaFingerprint(client);
      const up1 = await counts(client);
      expect(up1.tables).toBe(32); // 30 (D4) + ai_conversations + ai_messages
      expect(up1.policies).toBe(25); // 23 + ai_conversations_tenant + ai_messages_tenant

      // Roll the whole chain back → empty schema
      await runFiles(client, DOWN);
      const down = await counts(client);
      expect(down.tables).toBe(0);
      expect(down.policies).toBe(0);

      // Re-apply → fingerprint B must equal A
      await runFiles(client, UP);
      const after = await schemaFingerprint(client);
      const up2 = await counts(client);
      expect(up2.tables).toBe(32);
      expect(up2.policies).toBe(25);
      expect(after).toBe(before);
    } finally {
      await client.end();
    }
  });
});
