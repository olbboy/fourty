/**
 * Standalone worker process (Gate B4, ADR-004). Run with `npm run worker`.
 *
 * Registers a handler for every job queue. Each job runs inside
 * withWorkspace(payload.workspaceId) so RLS + audit apply exactly as in a
 * request, then delegates to runJob() (which claims idempotency and dispatches).
 * pg-boss handles retry, exponential backoff and dead-lettering per the queue
 * config in src/lib/queue.ts.
 *
 * This process shares the primary Postgres — no Redis, no extra service.
 */
import { db, tables, withWorkspace } from "@/db";
import { getBoss, stopBoss, enqueue, JOB_NAMES, SELF_MANAGED_JOBS, type JobEnvelope } from "@/lib/queue";
import { runJob } from "./handlers";
import { dispatchTick } from "./dispatch";
import { log } from "@/lib/logger";
import { initTracing } from "@/lib/otel";

async function main(): Promise<void> {
  initTracing(); // no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set
  const boss = await getBoss();

  for (const name of JOB_NAMES) {
    if (SELF_MANAGED_JOBS.includes(name)) {
      // The dispatcher opens its own short transactions — it must not hold one
      // across a mailbox fetch — and needs no idempotency claim, because taking
      // a task row already is one.
      await boss.work<JobEnvelope>(name, async (jobs) => {
        for (const job of jobs) await dispatchTick(job.data.workspaceId);
      });
    } else {
      await boss.work<JobEnvelope>(name, async (jobs) => {
        for (const job of jobs) {
          const env = job.data;
          await withWorkspace(env.workspaceId, () => runJob(name, env));
        }
      });
    }
    log().info({ queue: name }, "worker registered");
  }

  const stopTicking = startTicking();
  log().info({ queues: JOB_NAMES }, "fourty worker started");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log().info({ signal }, "worker shutting down");
    try {
      stopTicking();
      await stopBoss();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

/**
 * Ask every workspace to look at its own queue, on a timer.
 *
 * Enumerating workspaces is the one read here that is not tenant-scoped —
 * `workspaces` is the tenant registry, not tenant data. Each tick is enqueued as
 * a normal job so it inherits retry and the dead-letter queue, and the per-minute
 * idempotency key collapses two workers ticking the same workspace into one.
 *
 * A workspace with nothing due costs one indexed query. That is the price of not
 * having a cron expression that knows which tenants exist.
 */
function startTicking(): () => void {
  const intervalMs = Number(process.env.AGENT_TICK_SECONDS ?? 60) * 1000;
  if (intervalMs <= 0) {
    log().info({}, "agent dispatcher disabled (AGENT_TICK_SECONDS=0)");
    return () => {};
  }
  const tick = async () => {
    try {
      const rows = await db.select({ id: tables.workspaces.id }).from(tables.workspaces);
      const bucket = Math.floor(Date.now() / intervalMs);
      for (const ws of rows) {
        await enqueue("agent.dispatch", {}, {
          workspaceId: ws.id,
          idempotencyKey: `agent.dispatch:${ws.id}:${bucket}`,
        });
      }
    } catch (err) {
      log().error({ err }, "agent tick failed to enqueue");
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  void tick(); // do not make a fresh worker wait a whole interval
  log().info({ intervalMs }, "agent dispatcher ticking");
  return () => clearInterval(timer);
}

main().catch((err) => {
  log().error({ err }, "worker failed to start");
  process.exit(1);
});
