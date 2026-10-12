import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createWorkspace, resetDb } from "./pg-setup";
import { claimDue } from "@/lib/agent-tasks/claim";
import { scheduleTask, taskById } from "@/lib/agent-tasks/schedule";

/**
 * Claiming agent work, against real Postgres as the RLS-subject app role.
 *
 * **This file is the ship gate for Phase 2.** `claimDue` is the one piece of raw
 * SQL in the ledger, and a raw statement that misses the tenant predicate is a
 * cross-tenant leak that no other test would catch — the ORM tests all go
 * through drizzle, which cannot express this query. Everything here therefore
 * runs through `withWorkspace()` as `fourty_app`, exactly as the worker does.
 */
describe("claiming agent work (Postgres + RLS, as the app role)", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let wsA: string;
  let wsB: string;

  const inA = <T>(fn: () => Promise<T>) => withWorkspace(wsA, fn);
  const inB = <T>(fn: () => Promise<T>) => withWorkspace(wsB, fn);

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    wsA = await createWorkspace();
    wsB = await createWorkspace();
  });

  beforeEach(async () => {
    await inA(() => db.delete(tables.agentTasks));
    await inB(() => db.delete(tables.agentTasks));
  });

  it("connects as a role Postgres actually applies RLS to", async () => {
    // If this fails, every isolation assertion below is vacuous — the suite
    // would be proving the ledger is safe while running as the table owner.
    const { sql } = await import("drizzle-orm");
    const rows = await inA(async () =>
      (
        await db.execute<{ current_user: string; bypass: boolean }>(
          sql`SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`,
        )
      ).rows,
    );
    expect(rows[0].current_user).toBe("fourty_app");
    expect(rows[0].bypass).toBe(false);
  });

  it("hands back a due task once, marking it leased and counting the attempt", async () => {
    const task = await inA(() =>
      scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "Recompute" }),
    );
    const claimed = await inA(() => claimDue("direct", 10));
    expect(claimed.map((t) => t.id)).toEqual([task.id]);
    expect(claimed[0].attempts).toBe(1);
    expect(claimed[0].leasedUntil).toBeGreaterThan(Date.now());
    expect(claimed[0].startedAt).toBeTypeOf("number");

    // A second claimer inside the lease sees nothing.
    expect(await inA(() => claimDue("direct", 10))).toHaveLength(0);
  });

  it("gives two concurrent claimers disjoint work and never the same row", async () => {
    for (let i = 0; i < 20; i++) {
      await inA(() =>
        scheduleTask({ kind: "deal.health", entityType: "deal", entityId: `d${i}`, reason: "Recompute" }),
      );
    }
    // Two transactions racing over one table: SKIP LOCKED is what stops the
    // second from blocking on the first, and from taking its rows.
    const [first, second] = await Promise.all([inA(() => claimDue("direct", 10)), inA(() => claimDue("direct", 10))]);
    const ids = [...first, ...second].map((t) => t.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
  });

  it("re-offers a row once its lease expires, and keeps counting attempts", async () => {
    const task = await inA(() =>
      scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "Recompute" }),
    );
    // A worker that died: the lease is what brings the row back, not a sweeper.
    await inA(() => claimDue("direct", 10, -1_000));
    const again = await inA(() => claimDue("direct", 10));
    expect(again.map((t) => t.id)).toEqual([task.id]);
    expect(again[0].attempts).toBe(2);
  });

  it("never claims another workspace's rows", async () => {
    await inA(() =>
      scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "A's work" }),
    );
    expect(await inB(() => claimDue("direct", 10))).toHaveLength(0);
    // And A's row is untouched — B did not even count an attempt against it.
    const [row] = await inA(() => db.select().from(tables.agentTasks));
    expect(row.attempts).toBe(0);
    expect(row.leasedUntil).toBeNull();
  });

  it("claims each lane separately, so a model call cannot block a parser", async () => {
    await inA(() =>
      scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "direct work" }),
    );
    await inA(() =>
      scheduleTask({ kind: "recheck", entityType: "contact", entityId: "c1", reason: "session work" }),
    );
    const direct = await inA(() => claimDue("direct", 10));
    const session = await inA(() => claimDue("session", 10));
    expect(direct.map((t) => t.kind)).toEqual(["deal.health"]);
    expect(session.map((t) => t.kind)).toEqual(["recheck"]);
  });

  it("does not claim work that is not due yet", async () => {
    await inA(() =>
      scheduleTask({
        kind: "deal.health",
        entityType: "deal",
        entityId: "d1",
        reason: "later",
        dueAt: Date.now() + 60_000,
      }),
    );
    expect(await inA(() => claimDue("direct", 10))).toHaveLength(0);
  });

  it("returns the batch highest-priority first, which UPDATE … RETURNING does not", async () => {
    // Postgres does not carry the sub-select's ORDER BY into RETURNING, so a
    // low-priority sweep could otherwise be handed back ahead of a mailbox pull.
    await inA(() =>
      scheduleTask({ kind: "sweep.backfill", entityType: "contact", entityId: "c1", reason: "sweep" }),
    );
    await inA(() =>
      scheduleTask({ kind: "mailbox.pull", entityType: "sync_account", entityId: "a1", reason: "pull" }),
    );
    await inA(() =>
      scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "health" }),
    );
    const claimed = await inA(() => claimDue("direct", 10));
    expect(claimed.map((t) => t.kind)).toEqual(["mailbox.pull", "deal.health", "sweep.backfill"]);
  });

  it("ignores finished work", async () => {
    const task = await inA(() =>
      scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "done already" }),
    );
    await inA(() =>
      db
        .update(tables.agentTasks)
        .set({ finishedAt: Date.now(), outcome: "done" })
        .where(eq(tables.agentTasks.id, task.id)),
    );
    expect(await inA(() => claimDue("direct", 10))).toHaveLength(0);
    expect((await inA(() => taskById(task.id)))!.outcome).toBe("done");
  });
});
