import { eq } from "drizzle-orm";
import { db, tables, withWorkspace } from "@/db";
import { isAiEnabled } from "@/lib/ai/provider";
import { log } from "@/lib/logger";
import { recordAgentTask } from "@/lib/metrics";
import { recomputeDealScore } from "@/lib/services/deal-score";
import { canPull, pullAccount } from "@/lib/sync/pull";
import { claimDue } from "@/lib/agent-tasks/claim";
import { TASK_KINDS, type TaskKind } from "@/lib/agent-tasks/kinds";
import {
  completeTask,
  failTask,
  openTask,
  retireExhausted,
  retireLane,
  scheduleTask,
  type AgentTask,
} from "@/lib/agent-tasks/schedule";

/**
 * The dispatcher tick (Phase 2): book what is due, then drain both lanes.
 *
 * Each step opens its own short `withWorkspace()` transaction rather than
 * running the whole tick inside one. A tick fetches mail; holding a Postgres
 * transaction open across a provider round-trip is the same mistake ADR-015
 * refused for LLM streaming, and it would idle a connection for as long as
 * Gmail takes to answer.
 *
 * A duplicate tick needs no idempotency key: claiming is atomic, so a second
 * tick finds the rows leased and does nothing. The row is the message — a missed
 * tick costs latency, not work.
 */

/** How often a connected mailbox is pulled when nobody presses "Sync now". */
export const MAIL_PULL_INTERVAL_MS =
  Number(process.env.AGENT_MAIL_PULL_MINUTES ?? 15) * 60_000;

const DIRECT_BATCH = Number(process.env.AGENT_DIRECT_BATCH ?? 60);
const SESSION_BATCH = Number(process.env.AGENT_SESSION_BATCH ?? 12);

export type TickResult = {
  scheduled: number;
  direct: number;
  session: number;
  retired: number;
};

export async function dispatchTick(workspaceId: string): Promise<TickResult> {
  const scheduled = await withWorkspace(workspaceId, () => bookRecurringWork());
  let retired = await withWorkspace(workspaceId, () => retireExhausted());

  // A session task with no provider behind it is a promise nothing will keep.
  // Close it with a reason instead of leaving it queued forever.
  if (!isAiEnabled()) {
    retired += await withWorkspace(workspaceId, () =>
      retireLane("session", "not configured: no AI provider"),
    );
  }

  const direct = await drain(workspaceId, "direct", DIRECT_BATCH);
  const session = isAiEnabled() ? await drain(workspaceId, "session", SESSION_BATCH) : 0;

  // Re-book recurring work that finished during this tick, so a mailbox that
  // just synced already shows when it is next due rather than looking idle
  // until the next tick comes round.
  if (direct > 0) await withWorkspace(workspaceId, () => bookRecurringWork());

  if (scheduled + direct + session + retired > 0) {
    log().info({ workspace_id: workspaceId, scheduled, direct, session, retired }, "agent tick");
  }
  return { scheduled, direct, session, retired };
}

/**
 * Claim a batch and run it. Tasks run one at a time: each opens its own
 * transaction, and a lane whose work is mostly waiting on a provider gains
 * nothing from six connections doing the same waiting.
 */
async function drain(workspaceId: string, lane: "direct" | "session", limit: number): Promise<number> {
  const tasks = await withWorkspace(workspaceId, () => claimDue(lane, limit));
  for (const task of tasks) {
    await runTask(workspaceId, task);
  }
  return tasks.length;
}

async function runTask(workspaceId: string, task: AgentTask): Promise<void> {
  const kind = task.kind as TaskKind;
  const handler = HANDLERS[kind];
  if (!handler) {
    // A kind with no handler is not a failure to retry — it is work booked by a
    // version that could do it, running on one that cannot. Say so and stop.
    await withWorkspace(workspaceId, () => completeTask(task.id, "no handler for this kind yet"));
    recordAgentTask(kind, "no_handler");
    return;
  }
  try {
    const outcome = await handler(workspaceId, task);
    await withWorkspace(workspaceId, () => completeTask(task.id, outcome));
    recordAgentTask(kind, "done");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await withWorkspace(workspaceId, () => failTask(task.id, reason));
    recordAgentTask(kind, "failed");
    log().warn({ workspace_id: workspaceId, taskId: task.id, kind, err: reason }, "agent task failed");
  }
}

/**
 * What each kind does. A handler returns the outcome string a human reads on the
 * record; throwing means "try again later", up to the kind's budget.
 *
 * Only the kinds whose work exists today are here. The rest of the catalogue is
 * booked by later phases, and a task of one of those kinds retires with a reason
 * rather than looping.
 */
type TaskHandler = (workspaceId: string, task: AgentTask) => Promise<string>;

const HANDLERS: Partial<Record<TaskKind, TaskHandler>> = {
  "mailbox.pull": async (workspaceId, task) => {
    const accountId = task.entityId;
    if (!accountId) return "no account on this task";
    const result = await withWorkspace(workspaceId, () => pullAccount(accountId));
    if (!result.ok) {
      // The account already carries the error (pull.ts writes status/lastError),
      // so this throw is only about whether to try again — and the budget is
      // what stops "again" from meaning forever.
      throw new Error(result.reason);
    }
    // The next pull is not booked here: `scheduleTask` is idempotent per
    // (entity, kind), so booking it while this task is still open would only
    // move this row — and then completing it would leave nothing queued.
    // `bookRecurringWork` re-books it once this one has finished.
    if (result.emails) return `pulled ${result.emails.ingested} message(s), linked ${result.emails.linked}`;
    return `pulled ${result.calendar?.ingested ?? 0} event(s), linked ${result.calendar?.linked ?? 0}`;
  },

  "deal.health": async (workspaceId, task) => {
    if (!task.entityId) return "no deal on this task";
    const id = task.entityId;
    await withWorkspace(workspaceId, () => recomputeDealScore(id));
    return "health recomputed";
  },
};

/**
 * Recurring work is booked, not cron'd (backlog #14). Every connected account
 * Fourty can fetch for gets one open `mailbox.pull` whose `dueAt` is one
 * interval after its last successful sync — so a mailbox connected an hour ago
 * is due now, and one synced a minute ago is not.
 *
 * This only ever creates. Moving an open booking would overwrite a retry
 * backoff, so a task that already exists is left exactly where `failTask` or
 * the last completion put it.
 */
async function bookRecurringWork(): Promise<number> {
  const accounts = await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.status, "active"));
  let booked = 0;
  for (const account of accounts) {
    if (!canPull(account)) continue;
    // Only ever *create* here, never move an open booking. `scheduleTask` moves
    // `dueAt`, so re-booking a task that is mid-retry would overwrite the
    // backoff `failTask` just set — and for an account that has never synced
    // successfully, `lastSyncedAt` is null, so the computed dueAt is in 1970 and
    // the task would be due again on every single tick, burning its whole budget
    // in a few minutes. The next pull is booked once this one has finished.
    if (await openTask("mailbox.pull", "sync_account", account.id)) continue;
    await scheduleTask({
      kind: "mailbox.pull",
      entityType: "sync_account",
      entityId: account.id,
      reason: TASK_KINDS["mailbox.pull"].label,
      dueAt: (account.lastSyncedAt ?? 0) + MAIL_PULL_INTERVAL_MS,
    });
    booked += 1;
  }
  return booked;
}
