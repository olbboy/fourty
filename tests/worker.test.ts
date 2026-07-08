// Set queue tuning BEFORE any import of the queue module (it reads expiry at
// load): short job-expiry + fast supervisor so a killed in-flight job is
// redelivered within seconds, and the pg-boss driver instead of the test-default
// inline driver.
process.env.QUEUE_DRIVER = "pgboss";
process.env.QUEUE_EXPIRE_SECONDS = "4";
process.env.QUEUE_SUPERVISE_SECONDS = "1";
process.env.QUEUE_DATABASE_URL =
  process.env.MIGRATE_DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty_test";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Worker durability (Gate B4 acceptance): enqueue N jobs, SIGKILL the worker
 * mid-run, restart → every job completes exactly once. The idempotency ledger
 * (job_receipts, claimed transactionally before the side effect) is the
 * exactly-once proof: a redelivered job re-claims the same key and no-ops.
 *
 * The external webhook POST is at-least-once by nature (a job killed after the
 * POST but before commit is redelivered and re-POSTs) — we assert the receipt
 * count is EXACTLY N, and the delivery count is AT LEAST N.
 */
describe("worker: exactly-once under SIGKILL", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let enqueue: typeof import("@/lib/queue").enqueue;
  let stopBoss: typeof import("@/lib/queue").stopBoss;

  let ws: string;
  let server: http.Server;
  let hookUrl: string;
  let hits = 0;
  const workers: ChildProcess[] = [];

  const N = 12;

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ enqueue, stopBoss } = await import("@/lib/queue"));
    ws = await createWorkspace();

    // Slow local sink so jobs are in-flight long enough to SIGKILL mid-run.
    server = http.createServer((_req, res) => {
      hits += 1;
      setTimeout(() => {
        res.writeHead(200);
        res.end("ok");
      }, 200);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    hookUrl = `http://127.0.0.1:${port}/hook`;
  });

  afterAll(async () => {
    for (const w of workers) if (!w.killed) w.kill("SIGKILL");
    await stopBoss();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Vitest shares one process across files — undo the queue env so other files
    // fall back to the default inline driver.
    delete process.env.QUEUE_DRIVER;
    delete process.env.QUEUE_EXPIRE_SECONDS;
    delete process.env.QUEUE_SUPERVISE_SECONDS;
    delete process.env.QUEUE_DATABASE_URL;
  });

  const receiptCount = async (): Promise<number> => {
    return withWorkspace(ws, async () => (await db.select().from(tables.jobReceipts)).length);
  };

  const spawnWorker = (): ChildProcess => {
    // Run as a SINGLE node process (node --import tsx) so child.kill('SIGKILL')
    // actually terminates the worker — `npx tsx` would leave an unkilled
    // grandchild that keeps draining the queue and invalidates the kill test.
    const child = spawn(process.execPath, ["--import", "tsx", "src/worker/index.ts"], {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        QUEUE_DRIVER: "pgboss",
        QUEUE_EXPIRE_SECONDS: "4",
        QUEUE_SUPERVISE_SECONDS: "1",
        FOURTY_ALLOW_PRIVATE_WEBHOOKS: "1",
        LOG_LEVEL: "silent",
      },
      stdio: "ignore",
    });
    workers.push(child);
    return child;
  };

  const waitFor = async (
    pred: () => Promise<boolean>,
    timeoutMs: number,
    stepMs = 200,
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await pred()) return true;
      await new Promise((r) => setTimeout(r, stepMs));
    }
    return false;
  };

  it("processes every job exactly once across a kill + restart", async () => {
    // Enqueue N webhook jobs (unique idempotency keys) to the pg-boss queue.
    for (let i = 0; i < N; i++) {
      await enqueue(
        "webhook.deliver",
        { url: hookUrl, body: JSON.stringify({ i }), event: "test.tick" },
        { workspaceId: ws, idempotencyKey: `probe-${i}` },
      );
    }

    // Start a worker, let it complete a few, then SIGKILL mid-run.
    const first = spawnWorker();
    const gotSome = await waitFor(async () => (await receiptCount()) >= 2, 30_000);
    expect(gotSome).toBe(true);
    const partial = await receiptCount();
    expect(partial).toBeLessThan(N); // killed before draining the queue
    first.kill("SIGKILL");

    // Restart — the killed in-flight job's lease expires and is redelivered.
    spawnWorker();
    const drained = await waitFor(async () => (await receiptCount()) === N, 40_000);
    expect(drained).toBe(true);

    // Exactly-once on the transactional side effect; at-least-once on delivery.
    expect(await receiptCount()).toBe(N);
    expect(hits).toBeGreaterThanOrEqual(N);
  }, 90_000);
});
