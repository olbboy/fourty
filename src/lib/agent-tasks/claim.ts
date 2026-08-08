import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Lane } from "./kinds";
import type { AgentTask } from "./schedule";

/**
 * Claiming work (Phase 2). The one piece of raw SQL in the ledger, and the
 * highest-risk line in the phase.
 *
 * `FOR UPDATE SKIP LOCKED` is what lets two workers drain one table without
 * taking the same row and without blocking each other. The lease is what makes a
 * dead worker's rows come back: nothing is "in progress" forever, only leased
 * until a moment that passes.
 *
 * **RLS applies to both halves of this statement** — the sub-select and the
 * update — because it runs as the RLS-subject app role inside `withWorkspace()`.
 * That is not obvious from reading it, so `tests/agent-tasks-claim.test.ts`
 * proves it against real Postgres as the app role, and that test blocks merge.
 */

/** How long a claim holds a row before another worker may take it. */
export const LEASE_MS = Number(process.env.AGENT_LEASE_MS ?? 5 * 60_000);

/**
 * Take up to `limit` due rows in `lane`, marking them leased.
 *
 * The attempt is counted here, at claim time, not on completion: a task that
 * kills its worker every single time still runs out of budget and retires
 * visibly, rather than being retried until someone notices the log.
 */
export async function claimDue(lane: Lane, limit: number, leaseMs = LEASE_MS): Promise<AgentTask[]> {
  if (limit <= 0) return [];
  const now = Date.now();
  const leasedUntil = now + leaseMs;

  const result = await db.execute<AgentTask>(sql`
    UPDATE agent_tasks AS t
       SET leased_until = ${leasedUntil},
           attempts = t.attempts + 1,
           started_at = COALESCE(t.started_at, ${now})
      FROM (
        SELECT id
          FROM agent_tasks
         WHERE finished_at IS NULL
           AND lane = ${lane}
           AND due_at <= ${now}
           AND (leased_until IS NULL OR leased_until < ${now})
         ORDER BY priority DESC, due_at ASC
         LIMIT ${limit}
         FOR UPDATE SKIP LOCKED
      ) AS due
     WHERE t.id = due.id
    RETURNING t.id,
              t.workspace_id   AS "workspaceId",
              t.entity_type    AS "entityType",
              t.entity_id      AS "entityId",
              t.kind,
              t.reason,
              t.lane,
              t.priority,
              t.budget,
              t.attempts,
              t.due_at         AS "dueAt",
              t.leased_until   AS "leasedUntil",
              t.started_at     AS "startedAt",
              t.finished_at    AS "finishedAt",
              t.outcome,
              t.created_at     AS "createdAt"
  `);

  // Postgres does not carry the sub-select's ORDER BY into UPDATE … RETURNING,
  // so the priority order has to be re-established here or a low-priority sweep
  // can be handed back ahead of a mailbox pull.
  return [...result.rows].sort((a, b) => b.priority - a.priority || a.dueAt - b.dueAt);
}
