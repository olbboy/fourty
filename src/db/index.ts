import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

// Parse Postgres int8 (bigint) as a JS number — all our bigints are epoch-millis
// or counts, safely < 2^53 (ADR-006).
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

// The app runs as the non-owner `fourty_app` role so Postgres RLS applies to it
// (ADR-001). Migrations run as the owner `fourty` (see src/db/migrate.ts).
const DEFAULT_DSN = "postgresql://fourty_app:fourty_app@localhost:5432/fourty";

export type Db = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function createPool(): pg.Pool {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DSN,
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });
}

// Survive Next.js dev-mode HMR without leaking pools.
const globalForDb = globalThis as unknown as {
  __fourtyPool?: pg.Pool;
  __fourtyAls?: AsyncLocalStorage<{ tx: Tx }>;
};
export const pool = globalForDb.__fourtyPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__fourtyPool = pool;

const baseDb: Db = drizzle(pool, { schema });

// Carries the workspace-scoped transaction for the current async context.
const als = globalForDb.__fourtyAls ?? new AsyncLocalStorage<{ tx: Tx }>();
if (process.env.NODE_ENV !== "production") globalForDb.__fourtyAls = als;

function active(): Db {
  return (als.getStore()?.tx as unknown as Db) ?? baseDb;
}

/**
 * `db` transparently resolves to the current request's workspace-scoped
 * transaction when inside withWorkspace(), or the base pool otherwise. This lets
 * every existing `db.select()/insert()/…` call become tenant-scoped without
 * threading a tx parameter through the entire codebase.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const a = active() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(a, prop, receiver);
    return typeof value === "function" ? value.bind(a) : value;
  },
});

/**
 * Run `fn` inside a transaction whose `app.workspace_id` GUC is set to
 * `workspaceId`. Postgres RLS policies (USING/WITH CHECK on
 * current_setting('app.workspace_id')) then confine every query in `fn` to that
 * workspace, and workspace_id columns default to it on insert. `SET LOCAL` is
 * transaction-scoped, so this is safe under PgBouncer transaction pooling.
 */
export async function withWorkspace<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  if (!workspaceId) throw new Error("withWorkspace: workspaceId is required");
  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    return als.run({ tx }, fn);
  });
}

export * as tables from "./schema";
