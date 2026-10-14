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
    // Fail fast when the pool is saturated instead of hanging app-wide. Chat can
    // fan out several tool calls per turn against the shared pool (RT-G); a bounded
    // acquisition wait surfaces contention as an error rather than a silent stall.
    connectionTimeoutMillis: Number(process.env.PGPOOL_CONNECT_TIMEOUT_MS ?? 5_000),
  });
}

/**
 * Per-request async-context store. Carries the workspace-scoped transaction plus
 * observability breadcrumbs (request_id, workspace_id) so a request-scoped logger
 * and metrics can attach them without threading parameters through every call
 * (Gate B4). Fields are optional so the store can be entered for context alone
 * (withContext) before a transaction opens (withWorkspace).
 */
export type RequestStore = {
  tx?: Tx;
  requestId?: string;
  workspaceId?: string;
  /** Work held until this transaction commits (deferUntilCommit). */
  held?: (() => Promise<void>)[];
};

// Survive Next.js dev-mode HMR without leaking pools.
const globalForDb = globalThis as unknown as {
  __fourtyPool?: pg.Pool;
  __fourtyAls?: AsyncLocalStorage<RequestStore>;
};
export const pool = globalForDb.__fourtyPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__fourtyPool = pool;

const baseDb: Db = drizzle(pool, { schema });

// Carries the workspace-scoped transaction + request context for the current
// async context.
const als = globalForDb.__fourtyAls ?? new AsyncLocalStorage<RequestStore>();
if (process.env.NODE_ENV !== "production") globalForDb.__fourtyAls = als;

function active(): Db {
  return (als.getStore()?.tx as unknown as Db) ?? baseDb;
}

/** The current request's async-context store (empty object outside a request). */
export function currentStore(): RequestStore {
  return als.getStore() ?? {};
}

/**
 * Enter (or extend) the async context with request-scoped fields, without
 * opening a transaction. withAuth wraps the handler in this so the request_id +
 * workspace_id are visible to the logger/metrics even before/around
 * withWorkspace's transaction.
 */
export function withContext<T>(ctx: Partial<RequestStore>, fn: () => Promise<T>): Promise<T> {
  return als.run({ ...currentStore(), ...ctx }, fn);
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
 * Run `fn` in a savepoint of the current transaction: if it throws, what it
 * wrote is undone and the transaction carries on, so a caller can turn the
 * error into an answer without committing half the work. Outside a
 * transaction it simply runs `fn`.
 */
export async function withSavepoint<T>(fn: () => Promise<T>): Promise<T> {
  const store = currentStore();
  if (!store.tx) return fn();
  const heldBefore = store.held?.length ?? 0;
  try {
    return await store.tx.transaction((inner) => als.run({ ...store, tx: inner }, fn));
  } catch (err) {
    // What the savepoint wrote is undone, and so is the work it asked for.
    store.held?.splice(heldBefore);
    throw err;
  }
}

/**
 * Run `fn` inside a transaction whose `app.workspace_id` GUC is set to
 * `workspaceId`. Postgres RLS policies (USING/WITH CHECK on
 * current_setting('app.workspace_id')) then confine every query in `fn` to that
 * workspace, and workspace_id columns default to it on insert. `SET LOCAL` is
 * transaction-scoped, so this is safe under PgBouncer transaction pooling.
 */
export async function withWorkspace<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  if (!workspaceId) throw new Error("withWorkspace: workspaceId is required");
  const prev = currentStore();
  const held: (() => Promise<void>)[] = [];
  const result = await baseDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    return als.run({ ...prev, tx, workspaceId, held }, fn);
  });
  // Committed: now the work it asked for, each in a transaction of its own.
  for (const job of held) await withWorkspace(workspaceId, job);
  return result;
}

/**
 * Hold `job` until the current transaction commits, then run it in a
 * transaction of the same workspace. It never runs if that transaction, or
 * the savepoint it was asked for in, is rolled back. Returns false outside a
 * transaction: there is nothing to wait for, and the caller runs it now.
 */
export function deferUntilCommit(job: () => Promise<void>): boolean {
  const held = currentStore().held;
  if (!currentStore().tx || !held) return false;
  held.push(job);
  return true;
}

export * as tables from "./schema";
