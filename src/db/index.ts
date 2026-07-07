import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Parse Postgres int8 (bigint) as a JS number. All our bigints are epoch-millis
// or counts, safely < 2^53 — so no precision loss, and existing Date.now()
// arithmetic keeps working through the port (ADR-006). Also covers raw
// count(*) results, which pg otherwise returns as strings.
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const DEFAULT_DSN = "postgresql://fourty:fourty@localhost:5432/fourty";

export type Db = NodePgDatabase<typeof schema>;

function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL ?? DEFAULT_DSN;
  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

// Survive Next.js dev-mode HMR without leaking pools.
const globalForDb = globalThis as unknown as { __fourtyPool?: pg.Pool };
export const pool = globalForDb.__fourtyPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__fourtyPool = pool;

export const db: Db = drizzle(pool, { schema });

export * as tables from "./schema";
