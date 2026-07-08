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
import { withWorkspace } from "@/db";
import { getBoss, stopBoss, JOB_NAMES, type JobEnvelope } from "@/lib/queue";
import { runJob } from "./handlers";
import { log } from "@/lib/logger";
import { initTracing } from "@/lib/otel";

async function main(): Promise<void> {
  initTracing(); // no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set
  const boss = await getBoss();

  for (const name of JOB_NAMES) {
    await boss.work<JobEnvelope>(name, async (jobs) => {
      for (const job of jobs) {
        const env = job.data;
        await withWorkspace(env.workspaceId, () => runJob(name, env));
      }
    });
    log().info({ queue: name }, "worker registered");
  }

  log().info({ queues: JOB_NAMES }, "fourty worker started");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log().info({ signal }, "worker shutting down");
    try {
      await stopBoss();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log().error({ err }, "worker failed to start");
  process.exit(1);
});
