# ADR-004 — Queue & workers

**Status:** Accepted · **Date:** 2026-07-07

## Context
Workflow actions, webhook delivery, and (future) email/calendar sync must run
**outside the request cycle** with retries, backoff, and durability. Today the
workflow engine runs synchronously in-request and webhooks are fire-and-forget
(lost on failure). Production needs a real job queue with a worker process.

## Options
1. **pg-boss** — a job queue built on Postgres (`SELECT … FOR UPDATE SKIP
   LOCKED`). Retries, backoff, scheduling, dead-letter, archiving built in. One
   datastore; transactional enqueue (job and data commit together).
2. **graphile-worker** — also Postgres-based, very low latency; smaller feature
   surface (less built-in dead-letter/archival ergonomics).
3. **Redis + BullMQ** — Twenty's choice; highest throughput; adds Redis as a
   second stateful service to run, back up, and secure.

## Decision
**Option 1 — pg-boss.**

- No Redis: the Compose stack stays `app + worker + postgres`. Fewer moving
  parts and one backup/restore story (ADR-006, backup drill in Gate B4).
- **Transactional enqueue:** a job can be inserted in the same transaction as the
  domain change, so we never "did the work but lost the job" or vice-versa.
- Built-in **retry with exponential backoff**, **dead-letter** (via retry limit +
  failed-job retention), scheduling, and an **idempotency key** per job to make
  handlers safe against at-least-once delivery.
- Acceptance (Gate B4): kill the worker mid-job → job is neither lost nor run
  twice (idempotency + visibility timeout).

## Trade-offs
- Throughput ceiling is lower than Redis/BullMQ (Postgres row-locking vs
  in-memory). For Fourty's scale this is fine; if a tenant needs 10k+ jobs/s we
  can add a Redis-backed queue later behind the same job interface. We measure
  queue throughput in Gate B5 and publish it — no guessing.
- Queue load shares the primary Postgres; we isolate it in its own schema
  (`pgboss`) and watch `queue depth` in metrics (Gate B4).
