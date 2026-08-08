import { and, asc, desc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { log } from "@/lib/logger";
import { laneOf, TASK_KINDS, type Lane, type TaskKind } from "./kinds";

/**
 * Booking and finishing agent work (Phase 2).
 *
 * "Every N minutes, the oldest ten contacts" belongs in a `dueAt`, not a cron
 * expression: the row is the message. Everything here runs inside the caller's
 * `withWorkspace()` transaction, so RLS scopes it like any other tenant table.
 */

export type AgentTask = typeof tables.agentTasks.$inferSelect;

export type ScheduleInput = {
  kind: TaskKind;
  /** Why, in the words the record page will show. Not a log line. */
  reason: string;
  entityType?: string | null;
  entityId?: string | null;
  /** When it becomes claimable. Defaults to now. */
  dueAt?: number;
  priority?: number;
  budget?: number;
};

/**
 * Book work, or move the booking that already exists.
 *
 * Idempotent per (entity, kind): re-queuing an open task moves its `dueAt` and
 * reason rather than creating a second row. Without that, a pass that runs every
 * minute leaves a minute's worth of duplicate intentions behind it.
 */
export async function scheduleTask(input: ScheduleInput): Promise<AgentTask> {
  const spec = TASK_KINDS[input.kind];
  const now = Date.now();
  const dueAt = input.dueAt ?? now;
  const existing = await openTask(input.kind, input.entityType ?? null, input.entityId ?? null);

  if (existing) {
    // A task in someone's hands right now keeps its lease; only the intent moves.
    await db
      .update(tables.agentTasks)
      .set({ dueAt, reason: input.reason, priority: input.priority ?? existing.priority })
      .where(eq(tables.agentTasks.id, existing.id));
    return (await taskById(existing.id))!;
  }

  const id = newId();
  await db.insert(tables.agentTasks).values({
    id,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    kind: input.kind,
    reason: input.reason,
    lane: laneOf(input.kind),
    priority: input.priority ?? spec.priority,
    budget: input.budget ?? spec.budget,
    dueAt,
    createdAt: now,
  });
  return (await taskById(id))!;
}

/** The open (unfinished) task for this (entity, kind), if there is one. */
export async function openTask(
  kind: TaskKind,
  entityType: string | null,
  entityId: string | null,
): Promise<AgentTask | null> {
  const [row] = await db
    .select()
    .from(tables.agentTasks)
    .where(
      and(
        eq(tables.agentTasks.kind, kind),
        isNull(tables.agentTasks.finishedAt),
        entityType === null
          ? isNull(tables.agentTasks.entityType)
          : eq(tables.agentTasks.entityType, entityType),
        entityId === null ? isNull(tables.agentTasks.entityId) : eq(tables.agentTasks.entityId, entityId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function taskById(id: string): Promise<AgentTask | null> {
  const [row] = await db.select().from(tables.agentTasks).where(eq(tables.agentTasks.id, id)).limit(1);
  return row ?? null;
}

/** Finish a task with the outcome a human will read. Releases the lease. */
export async function completeTask(id: string, outcome: string): Promise<void> {
  await db
    .update(tables.agentTasks)
    .set({ finishedAt: Date.now(), leasedUntil: null, outcome })
    .where(eq(tables.agentTasks.id, id));
}

/**
 * A failed attempt. The attempt was already counted at claim time, so this only
 * decides between trying again later and retiring: a task that has spent its
 * budget stops, visibly, with the reason it stopped. Nothing is retried forever.
 */
export async function failTask(id: string, outcome: string, retryDelayMs = 60_000): Promise<void> {
  const task = await taskById(id);
  if (!task) return;
  if (task.attempts >= task.budget) {
    await db
      .update(tables.agentTasks)
      .set({ finishedAt: Date.now(), leasedUntil: null, outcome: `gave up after ${task.attempts}: ${outcome}` })
      .where(eq(tables.agentTasks.id, id));
    log().warn({ taskId: id, kind: task.kind, attempts: task.attempts }, "agent task retired");
    return;
  }
  await db
    .update(tables.agentTasks)
    .set({ leasedUntil: null, dueAt: Date.now() + retryDelayMs, outcome })
    .where(eq(tables.agentTasks.id, id));
}

/**
 * Belt and braces: retire anything that outlived its budget without a worker
 * around to notice — a process killed between the claim and the failure never
 * gets to call `failTask`, and a row nobody will ever run must not sit "due"
 * forever pretending it is going to happen.
 */
export async function retireExhausted(): Promise<number> {
  const rows = await db
    .update(tables.agentTasks)
    .set({ finishedAt: Date.now(), leasedUntil: null, outcome: "gave up: out of attempts" })
    .where(
      and(
        isNull(tables.agentTasks.finishedAt),
        sql`${tables.agentTasks.attempts} >= ${tables.agentTasks.budget}`,
      ),
    )
    .returning({ id: tables.agentTasks.id });
  return rows.length;
}

/**
 * Retire every open task in a lane. Used when the `session` lane has no provider
 * behind it: the work cannot happen, so it is closed with a reason rather than
 * left queued as a promise nothing will keep.
 */
export async function retireLane(lane: Lane, outcome: string): Promise<number> {
  const rows = await db
    .update(tables.agentTasks)
    .set({ finishedAt: Date.now(), leasedUntil: null, outcome })
    .where(and(eq(tables.agentTasks.lane, lane), isNull(tables.agentTasks.finishedAt)))
    .returning({ id: tables.agentTasks.id });
  return rows.length;
}

/** What is queued about this record, soonest first — the record page's answer. */
export async function openTasksFor(entityType: string, entityId: string): Promise<AgentTask[]> {
  return db
    .select()
    .from(tables.agentTasks)
    .where(
      and(
        eq(tables.agentTasks.entityType, entityType),
        eq(tables.agentTasks.entityId, entityId),
        isNull(tables.agentTasks.finishedAt),
      ),
    )
    .orderBy(asc(tables.agentTasks.dueAt));
}

/** The last thing the agent actually did here, and what came of it. */
export async function lastDecision(entityType: string, entityId: string): Promise<AgentTask | null> {
  const [row] = await db
    .select()
    .from(tables.agentTasks)
    .where(
      and(
        eq(tables.agentTasks.entityType, entityType),
        eq(tables.agentTasks.entityId, entityId),
        isNotNull(tables.agentTasks.finishedAt),
      ),
    )
    .orderBy(desc(tables.agentTasks.finishedAt))
    .limit(1);
  return row ?? null;
}

/** Everything due now, for a status view. Not the claim path — that is claim.ts. */
export async function dueTasks(limit = 50): Promise<AgentTask[]> {
  return db
    .select()
    .from(tables.agentTasks)
    .where(and(isNull(tables.agentTasks.finishedAt), lte(tables.agentTasks.dueAt, Date.now())))
    .orderBy(desc(tables.agentTasks.priority), asc(tables.agentTasks.dueAt))
    .limit(limit);
}
