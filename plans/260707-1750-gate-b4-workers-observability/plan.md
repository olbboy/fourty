# Gate B4 — Workers/queue + rate limit + observability + backup drill

Status: DONE (2026-07-08) · Branch: main · Plan: docs/roadmap-b3-b4-b5.md §B4
Evidence: 94/94 tests green (worker/ratelimit/metrics), backup-drill PASS (21
tables), live E2E (metrics + RateLimit headers + pgboss enqueue), tsc + build green.

## Objective
Heavy/async work leaves the request path durably; the stack is observable and its
backups are proven.

## Phases
1. **Queue + worker (pg-boss)** — `src/lib/queue.ts` (enqueue, inline+pgboss
   drivers, idempotency via `job_receipts`), `src/worker/{handlers,index}.ts`,
   engine webhook + workflow-dispatch moved off the request path. Migration
   `0005_queue` (`job_receipts` + RLS). Compose `worker` service.
2. **Rate limit (whole API)** — generalize `ratelimit.ts`, apply in `withAuth`,
   `RateLimit-*`+`Retry-After` headers, per-route budgets (read/write/bulk).
3. **Observability** — `pino` request-scoped child logger (request_id +
   workspace_id via the AsyncLocalStorage store), `GET /metrics` Prometheus
   (HTTP latency histogram, request counter, DB pool gauges, queue depth),
   optional OTel hook behind `OTEL_EXPORTER_OTLP_ENDPOINT`.
4. **Backup drill** — `scripts/backup-drill.sh` (pg_dump→counts→restore→re-check
   →PASS/FAIL), `bench/zero-downtime.k6.js` expand-migration-under-load.

## Acceptance
- Worker kill test: enqueue N, SIGKILL mid-run, restart → each completes exactly
  once (assert via `job_receipts` count).
- Rate-limit + `/metrics` tests green; `backup-drill.sh` output recorded.
- Isolation suite still green; reversibility test updated (21 tables / 16 policies).

## Standing invariants (do not regress)
- App connects as `fourty_app`; migrations as owner `fourty`.
- Every data query inside `withWorkspace()`; job handlers re-enter it (RLS+audit).
- `tests/tenant-isolation.test.ts` stays 100% green.
