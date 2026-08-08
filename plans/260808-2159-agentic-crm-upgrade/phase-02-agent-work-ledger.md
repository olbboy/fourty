# Phase 2 — Agent work ledger + two-lane dispatcher

**Size:** M · **Depends on:** Phase 0 · **Blocks:** Phase 3, Phase 5 · **Status:** done (2026-08-09)

## Delivered

`agent_tasks` (migration `0014`, reversible in CI), `src/lib/agent-tasks/{kinds,schedule,claim}.ts`,
`src/worker/dispatch.ts`, the `agent.dispatch` tick registered on pg-boss, the
`mailbox.pull` kind closing backlog **#14**, `GET /api/agent-tasks`, and a
"Background work" panel on the contact / company / deal pages plus a next-pull
line in Settings → Mailboxes. Tests: `tests/agent-tasks-claim.test.ts` (9, the
ship gate), `tests/agent-tasks-schedule.test.ts` (15). Full suite 504 passed,
14 e2e, build green.

### Deviations from this plan, all deliberate

- **The tick is not one transaction, and tasks run one at a time.** Step 4 asks
  for concurrency 6 in the direct lane. A pg-boss job handler runs inside one
  `withWorkspace()` transaction, i.e. one connection — six "concurrent" tasks
  would serialise on it anyway, and the transaction would stay open across a
  Gmail round-trip, which is the mistake ADR-015 refused for LLM streaming. So
  `agent.dispatch` is self-managed (`SELF_MANAGED_JOBS` in `src/lib/queue.ts`):
  it opens a short transaction per step and runs tasks sequentially.
- **The tick is enqueued per workspace by the worker**, which enumerates
  `workspaces` (the tenant registry, not tenant data — no RLS policy). A
  per-minute idempotency key collapses two workers ticking the same workspace.
- **Recurrence is booked in one place.** The `mailbox.pull` handler does *not*
  book its own next run: `scheduleTask` is idempotent per (entity, kind), so
  booking while the current task is still open only moves that row, and
  completing it would then leave nothing queued. `bookRecurringWork()` re-books
  after the drain instead. This was found by a test, not by review.
- **Metrics are counters, not gauges.** The plan asks for due/leased/retired
  counts per kind on `/metrics`. That endpoint has no workspace, so a query over
  `agent_tasks` would be RLS-scoped to nothing; `fourty_agent_tasks_total{kind,outcome}`
  is incremented as work finishes instead, and survives the rows being closed.
- **`deal.health` has a handler but nothing books it yet.** Booking a recompute
  for every deal on a timer is a scheduling decision this phase does not need to
  make; the handler exists so the kind is not a stub.
- **Kinds with no handler retire with a reason** rather than looping —
  `contact.evidence`, `contact.research`, `sweep.backfill` and `recheck` arrive
  with Phases 3 and 5.

Along the way: `src/lib/metrics.ts` turned out to contain eight NUL bytes, which
made git and ripgrep treat it as binary. Repaired, with
`tests/source-hygiene.test.ts` so no source file can carry one again.

### Fixed after review

`bookRecurringWork` used to call `scheduleTask` unconditionally, and
`scheduleTask` moves `dueAt` on an open row. So every tick overwrote whatever
`failTask` had just set: a failing pull lost its backoff, and an account that had
never synced successfully (`lastSyncedAt` null → computed dueAt in 1970) came due
again on every tick and burned its whole budget in minutes. It now only ever
*creates*, and a regression test pins the backoff surviving the next tick.

### Carried forward, deliberately

- **The mailbox pull still holds a transaction across the network.** The tick no
  longer does, but `withWorkspace(ws, () => pullAccount(id))` wraps a Gmail
  round-trip in one. The fix is to split it — short transaction to read the
  account, network with no transaction open, short transaction to ingest and mark
  — and it belongs with Phase 3, which is what makes the volume matter. The
  "Sync now" route has always had the same shape and should be split with it.
- **No partial unique index on an open (workspace, entity, kind).** `scheduleTask`
  checks then inserts, so two schedulers racing could create two open rows for one
  booking. Today one worker ticks per workspace per minute and nothing else books,
  so the window is theoretical; the fix is a `UNIQUE … WHERE finished_at IS NULL`
  index when a second scheduler exists.
- **`needsProvider()` is not consulted at booking time.** Nothing in this phase
  books a session kind at all, so "never scheduled without a provider" is
  currently vacuous, and the retire-at-drain path covers a provider removed later.
  Phase 3 books the first session kind and should check it there.

## Why

pg-boss is a good job queue and a bad answer to *"what is the agent going to do about this contact, when, and why"*. A job payload is opaque, it is deleted when it completes, and it cannot be joined to a contact row. Comp AI's insight is that the **intent** belongs in a domain table and the queue merely drains it:

> "Every N minutes, the oldest ten contacts" belongs in a `dueAt`, not a cron expression.

The second half is lane separation. They measured work-with-nothing-to-decide queueing behind sixty LLM sessions for 25 minutes. Fourty will have exactly the same shape the moment a model-backed pass exists next to a parse-only one.

This phase also closes backlog **#14** (periodic mail auto-pull) — not as a cron, as a task kind with a `dueAt`.

## Requirements

- One table holds every unit of agent work with a human-readable `reason`, a `dueAt`, a priority, a budget and an outcome.
- Claiming is `FOR UPDATE SKIP LOCKED` under a lease, so two workers take disjoint work and a worker that dies frees its rows when the lease expires.
- Two lanes: `direct` (deterministic, no model — parse, derive, sync) and `session` (model-backed). Different batch sizes, drained in the same tick.
- Scheduling is idempotent per (entity, kind): re-queuing an open task moves its `dueAt` and reason instead of creating a second row.
- Attempts are capped; an exhausted task is *retired* with an outcome, never retried forever.
- Nothing here requires an LLM. With no AI provider configured the `direct` lane still runs.

## Files

**Create**
- `drizzle/00XX_agent_tasks.sql` (+ down).
- `src/lib/agent-tasks/schedule.ts` — `scheduleTask()`, `completeTask()`, `retireExhausted()`, `lastDecision()`.
- `src/lib/agent-tasks/claim.ts` — `claimDue(limit, lane)` raw SQL under `withWorkspace()`.
- `src/lib/agent-tasks/kinds.ts` — the kind catalogue, its lane, priority and default budget.
- `src/worker/dispatch.ts` — the tick: drain `direct`, then `session`.
- `tests/agent-tasks-claim.test.ts` (real PG, concurrent claim), `tests/agent-tasks-schedule.test.ts`.

**Modify**
- `src/db/schema.ts` — add `agentTasks`.
- `src/lib/queue.ts` — add `agent.dispatch` to `JobPayloads`/`JOB_NAMES`/`QUEUE_CONFIG`.
- `src/worker/index.ts` / `handlers.ts` — register the dispatch handler + a schedule so it ticks.
- `src/lib/metrics.ts` — due/leased/retired counts per kind on `/metrics`.
- `src/app/api/sync/accounts/[id]/run` call path — mail pull becomes a `mailbox.pull` task.

## Schema

```
agent_tasks
  id, workspace_id
  entity_type, entity_id          -- nullable: a workspace-wide sweep has neither
  kind, reason                    -- reason is shown to the user, verbatim
  lane                            -- 'direct' | 'session'
  priority int, budget int, attempts int
  due_at, leased_until
  started_at, finished_at, outcome
  created_at
  index (workspace_id, due_at, leased_until)
  index (workspace_id, entity_type, entity_id)
```

## Kind catalogue (v1)

| kind | lane | priority | what |
|---|---|---|---|
| `mailbox.pull` | direct | 900 | Periodic mail/calendar fetch (closes backlog #14) |
| `contact.evidence` | direct | 500 | Parse synced mail/meetings into evidence (Phase 3) |
| `deal.health` | direct | 400 | Recompute scoring on a schedule rather than on read |
| `contact.research` | session | 100 | Model-backed pass (Phase 3, needs `AI_PROVIDER`) |
| `sweep.backfill` | direct | 50 | Records never looked at, capped per pass |
| `recheck` | session | 0 | Booked by the agent itself, with its reason |

## Steps

1. Migration + RLS. `claimDue` runs inside `withWorkspace()` so the RLS predicate applies to the `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`. **Verify this explicitly** — a raw statement that bypasses the tenant GUC is a cross-tenant leak, and this is the highest-risk line in the phase.
2. Sort the *claimed* rows in JS as well: Postgres does not order `UPDATE … RETURNING` by the sub-select's `ORDER BY`.
3. `scheduleTask` upserts on (workspace, entity, kind, unfinished).
4. Dispatcher tick: `direct` batch (default 60, concurrency 6) then `session` batch (default 12, one at a time). Enqueued as one `agent.dispatch` pg-boss job per tick per workspace; the existing idempotency claim (`job_receipts`) prevents double drains.
5. **The `session` lane without an AI provider:** session kinds are never *scheduled* when `AI_PROVIDER` is off; any that exist anyway (provider removed later) retire with outcome `not_configured` on the next tick. The `direct` lane always runs. No queued zombies.
6. Retire at `MAX_ATTEMPTS` with an outcome string — a stuck row must be visible, not invisible. `mailbox.pull` specifically: an OAuth refresh failure sets the `sync_accounts.status`/`lastError` fields and a visible task outcome — never a silent retry-forever.
7. Surface it: a record's detail sheet shows *what is queued and why*, with the `dueAt`. `/metrics` gets the counters.

**Ship gate:** the RLS × `FOR UPDATE SKIP LOCKED` claim test (step 1) runs as the app role against real Postgres and blocks merge — it is not a nice-to-have.

## Validation

- Concurrency test: two claimers, one table, zero overlap, and a lease that expires re-offers the row.
- Cross-tenant test: workspace B never claims workspace A's rows.
- Kill test: a worker killed mid-task frees the row after the lease and the retry is a no-op past the idempotency claim.
- Backlog #14 proven: a connected mailbox pulls without anyone pressing Sync now.

## Risks

- **Raw SQL + RLS** — the one place to get wrong. Pin it with a test that runs as the app role, not the owner role.
- **Two queues, one meaning** — pg-boss stays the *transport*; `agent_tasks` is the *intent*. Do not duplicate retry policy in both: pg-boss retries the tick, `attempts` counts the work.
- **Tick storms** — collapse concurrent dispatch requests per workspace; the row is the message, so a missed tick costs latency, not work.
