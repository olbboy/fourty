import { PgBoss } from "pg-boss";
import { lt } from "drizzle-orm";
import { db, tables } from "@/db";
import { log } from "@/lib/logger";
import type { EventContext } from "@/lib/workflows/types";

/**
 * Background job queue (Gate B4, ADR-004: pg-boss on the same Postgres, no Redis).
 *
 * Two drivers:
 *  - `pgboss` (default outside tests): jobs are persisted to the `pgboss` schema
 *    and processed by the standalone worker (`npm run worker`) with retry,
 *    exponential backoff and a dead-letter queue.
 *  - `inline` (default under NODE_ENV=test, and a valid single-process dev mode):
 *    `enqueue()` runs the handler immediately, in the caller's async context.
 *    This keeps the existing synchronous behaviour (and tests) intact while the
 *    call sites migrate to the queue API.
 *
 * Exactly-once: delivery is at-least-once (a worker killed after a side effect
 * but before ack is redelivered), so every handler first claims its idempotency
 * key in `job_receipts` — a duplicate delivery no-ops instead of repeating work.
 *
 * pg-boss connects as the OWNER role (it manages its own schema DDL). This is a
 * separate pool from the RLS-subject app pool; it only ever touches the `pgboss`
 * schema. Job handlers re-enter `withWorkspace()` (app pool, RLS) for all tenant
 * data, so isolation + audit hold end-to-end.
 */

// ── Job catalogue ───────────────────────────────────────────────────────────

export type JobPayloads = {
  "webhook.deliver": { url: string; body: string; event: string };
  "workflow.dispatch": { ctx: EventContext };
};

export type JobName = keyof JobPayloads;

/** What a handler actually receives: tenant + idempotency key + typed data. */
export type JobEnvelope<N extends JobName = JobName> = {
  workspaceId: string;
  idempotencyKey: string;
  data: JobPayloads[N];
};

export const JOB_NAMES: JobName[] = ["webhook.deliver", "workflow.dispatch"];

// Per-queue durability policy. retryBackoff=true → exponential backoff seeded by
// retryDelay; exhausted jobs move to `<name>.dead` (retained, never auto-run).
// `expireInSeconds` is how long a job may stay "active" before it's presumed
// dead and redelivered — tunable via QUEUE_EXPIRE_SECONDS so a kill test can
// prove exactly-once quickly (production keeps the generous default).
const EXPIRE_SECONDS = Number(process.env.QUEUE_EXPIRE_SECONDS ?? 120);
const QUEUE_CONFIG: Record<JobName, { retryLimit: number; expireInSeconds: number }> = {
  "webhook.deliver": { retryLimit: 5, expireInSeconds: EXPIRE_SECONDS },
  "workflow.dispatch": { retryLimit: 3, expireInSeconds: EXPIRE_SECONDS },
};

export const deadLetterName = (name: JobName | string) => `${name}.dead`;

// ── Driver selection ────────────────────────────────────────────────────────

export function queueDriver(): "inline" | "pgboss" {
  const explicit = process.env.QUEUE_DRIVER;
  if (explicit === "inline" || explicit === "pgboss") return explicit;
  return process.env.NODE_ENV === "test" ? "inline" : "pgboss";
}

function queueConnectionString(): string {
  // pg-boss owns its schema (DDL) → connect as the owner, not fourty_app.
  return (
    process.env.QUEUE_DATABASE_URL ??
    process.env.MIGRATE_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://fourty:fourty@localhost:5432/fourty"
  );
}

const globalForQueue = globalThis as unknown as {
  __fourtyBoss?: PgBoss;
  __fourtyBossStarting?: Promise<PgBoss>;
};

/** Lazily start (and memoize) a pg-boss instance. Idempotent across calls. */
export async function getBoss(): Promise<PgBoss> {
  if (globalForQueue.__fourtyBoss) return globalForQueue.__fourtyBoss;
  if (globalForQueue.__fourtyBossStarting) return globalForQueue.__fourtyBossStarting;

  const boss = new PgBoss({
    connectionString: queueConnectionString(),
    schema: "pgboss",
    // Keep expiry responsive so a killed in-flight job is redelivered promptly
    // (tunable for tests; production defaults are fine).
    superviseIntervalSeconds: Number(process.env.QUEUE_SUPERVISE_SECONDS ?? 60),
  });
  boss.on("error", (err) => log().error({ err }, "pg-boss error"));

  globalForQueue.__fourtyBossStarting = (async () => {
    await boss.start();
    await ensureQueues(boss);
    globalForQueue.__fourtyBoss = boss;
    return boss;
  })();
  return globalForQueue.__fourtyBossStarting;
}

/** Create every job queue (+ its dead-letter queue) with its durability policy. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of JOB_NAMES) {
    const cfg = QUEUE_CONFIG[name];
    await boss.createQueue(deadLetterName(name));
    await boss.createQueue(name, {
      retryLimit: cfg.retryLimit,
      retryBackoff: true,
      retryDelay: 1,
      expireInSeconds: cfg.expireInSeconds,
      deadLetter: deadLetterName(name),
    });
  }
}

// ── Enqueue ─────────────────────────────────────────────────────────────────

export type EnqueueOpts = { workspaceId: string; idempotencyKey?: string };

/**
 * Enqueue a job. In `pgboss` mode it is persisted for the worker; in `inline`
 * mode the handler runs now, in the caller's workspace context. The idempotency
 * key travels in the envelope so redeliveries hit the same `job_receipts` row.
 */
export async function enqueue<N extends JobName>(
  name: N,
  data: JobPayloads[N],
  opts: EnqueueOpts,
): Promise<void> {
  const idempotencyKey = opts.idempotencyKey ?? `${name}:${cryptoRandom()}`;
  const envelope: JobEnvelope<N> = { workspaceId: opts.workspaceId, idempotencyKey, data };

  if (queueDriver() === "inline") {
    // Run in the caller's ambient withWorkspace() context (already RLS-scoped).
    const { runJob } = await import("@/worker/handlers");
    await runJob(name, envelope);
    return;
  }

  try {
    const boss = await getBoss();
    await boss.send(name, envelope, {
      singletonKey: idempotencyKey, // dedupe concurrent enqueues of the same job
      retryLimit: QUEUE_CONFIG[name].retryLimit,
      retryBackoff: true,
      retryDelay: 1,
      expireInSeconds: QUEUE_CONFIG[name].expireInSeconds,
      deadLetter: deadLetterName(name),
    });
  } catch (err) {
    // Queue unreachable (misconfigured / no worker / DB lacks the pgboss schema):
    // degrade to inline so the request still completes and the job isn't lost.
    // Pre-B4 behaviour, minus durability — logged, not silent.
    log().warn({ err, job: name }, "queue unavailable — running job inline");
    const { runJob } = await import("@/worker/handlers");
    await runJob(name, envelope);
  }
}

function cryptoRandom(): string {
  // Avoids importing newId here (keeps the queue lib dependency-light); the key
  // only needs to be unique per enqueue, not URL-safe.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Idempotency claim (called by handlers) ──────────────────────────────────

// How long a receipt must outlive its job's redelivery window. After this it is
// safe to prune (a job can't be redelivered once pg-boss has retired it).
const RECEIPT_RETENTION_MS = Number(
  process.env.QUEUE_RECEIPT_RETENTION_MS ?? 7 * 24 * 60 * 60 * 1000,
);

/**
 * Claim a job's idempotency key for the active workspace. Returns true if this
 * is the first time the key is seen (do the work), false if already processed
 * (skip — a redelivery). Must run inside a withWorkspace() transaction.
 *
 * Opportunistically prunes expired receipts for this workspace (RLS-scoped) so
 * the ledger stays bounded without a separate maintenance job.
 */
export async function claimJob(idempotencyKey: string, queue: string): Promise<boolean> {
  const inserted = await db
    .insert(tables.jobReceipts)
    .values({ key: idempotencyKey, queue, createdAt: Date.now() })
    .onConflictDoNothing()
    .returning({ key: tables.jobReceipts.key });

  if (inserted.length > 0 && Math.random() < 0.02) {
    await db
      .delete(tables.jobReceipts)
      .where(lt(tables.jobReceipts.createdAt, Date.now() - RECEIPT_RETENTION_MS));
  }
  return inserted.length > 0;
}

// ── Observability ────────────────────────────────────────────────────────────

/** Depth (queued + active) per job queue, for the /metrics endpoint. 0 inline. */
export async function queueDepths(): Promise<Record<string, number>> {
  if (queueDriver() === "inline" || !globalForQueue.__fourtyBoss) return {};
  const boss = globalForQueue.__fourtyBoss;
  const out: Record<string, number> = {};
  for (const name of JOB_NAMES) {
    const q = await boss.getQueue(name);
    out[name] = q ? q.queuedCount + q.activeCount : 0;
  }
  return out;
}

/** Graceful shutdown for the worker / process exit. */
export async function stopBoss(): Promise<void> {
  const boss = globalForQueue.__fourtyBoss;
  if (boss) {
    await boss.stop({ graceful: true });
    globalForQueue.__fourtyBoss = undefined;
    globalForQueue.__fourtyBossStarting = undefined;
  }
}
