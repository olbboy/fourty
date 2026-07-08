# Execution plan — Gates B3, B4, B5

Actionable plan for the next gates, written so a fresh session can execute
without re-deriving anything. Read `PROGRESS.md` + `docs/adr/` first. Every gate
closes with passing tests on real Postgres (+ RLS) and a `gate(Bx): … — evidence:`
commit.

**Standing invariants (do not regress):**
- App connects as non-owner `fourty_app`; migrations as owner `fourty`.
- Every data query runs inside `withWorkspace()` (via `withAuth`), so RLS applies.
- `tests/tenant-isolation.test.ts` must stay 100% green — never weaken it.
- New migrations: `npm run db:generate` (or `--custom` for RLS/grants/functions),
  then a hand-written `drizzle/down/NNNN_*.down.sql`, and extend
  `tests/migration-reversibility.test.ts` (bump expected table/policy counts).

---

## Gate B3 — RBAC enforcement + user management + audit log — ✅ DONE

> **Done (2026-07-07).** Delivered per this plan: `src/lib/permissions.ts` matrix +
> `authorize()` guard wired into every mutating route (static guard in
> `tests/api-auth.test.ts`); members API (invite/accept-with-signup/list/role/
> deactivate + last-admin guard) + Settings → Team UI; immutable `audit_log`
> (`0004_audit_rls`: RLS + REVOKE + DO-INSTEAD-NOTHING rules) + `/api/audit`.
> Evidence: `permissions`/`rbac-matrix`/`members`/`audit-log` tests, 84/84 green,
> live E2E. See `PROGRESS.md` § Gate B3. **Next: Gate B4.**

**Objective:** membership roles become *enforced*; workspaces can manage members;
every mutation is audit-logged immutably.

### B3.1 Permission matrix + guard
- `src/lib/permissions.ts`: a matrix `role → { object → Set<action> }` for
  `admin | member | viewer`. Baseline: `viewer` = read all CRM objects; `member`
  = read/write CRM objects (contacts/companies/deals/tasks/notes/activities/
  workflows/custom-fields/saved-views), no member/key/settings mutations; `admin`
  = everything. Export `can(role, object, action): boolean`.
- `authorize(auth, object, action)` helper in `src/lib/api.ts` returning a 403
  `NextResponse` when denied. The caller's role comes from `workspace_members`
  for `auth.user` (session) — add `role` to `AuthOk` (resolve in `authenticate`
  via `roleInWorkspace(userId, workspaceId)`; for API keys, add a `role`/scopes
  column to `api_keys`, default `admin` for back-compat).
- Wire `authorize(...)` into every mutating handler (POST/PATCH/DELETE) right
  after `withAuth`’s callback opens. Keep GET open to any member/viewer.

### B3.2 Route-coverage guard (anti-forgetting)
- `tests/rbac-matrix.test.ts`: enumerate `(role × endpoint × method)`; for each,
  build a request as that role and assert the documented allow/deny (200/201 vs
  403). Drive real handlers with two seeded users (admin, viewer) in one workspace.
- A static guard: scan mutating route files; any that don’t reference
  `authorize(`/`requireRole(` **fail CI** (extend the existing static test in
  `tests/api-auth.test.ts`). This is the “new route without a matrix entry fails
  CI” requirement.

### B3.3 User management
- Migration `0003_members`: `invites(id, workspace_id, email, role, token_hash,
  expires_at, accepted_at, created_at)` (RLS-scoped). Add `deactivated_at` to
  `workspace_members`.
- Endpoints (all admin-only via `authorize`):
  - `POST /api/members/invite` → create invite + return token (email side-channel
    later); `POST /api/members/accept` (token → membership); `PATCH
    /api/members/[userId]` (change role); `DELETE /api/members/[userId]`
    (deactivate). **Last active admin cannot remove/demote self** — guard it.
- UI: a Settings → Members panel (list, invite, role dropdown, remove).

### B3.4 Immutable audit log
- Migration `0004_audit` (`--custom` for the immutability rules):
  `audit_log(id, workspace_id, actor_id, action, object_type, object_id, meta,
  created_at)`. Enable RLS (workspace-scoped) + FORCE.
  **Immutability:** `REVOKE UPDATE, DELETE ON audit_log FROM fourty_app;` and add
  a rule/trigger `CREATE RULE audit_no_update AS ON UPDATE TO audit_log DO
  INSTEAD NOTHING;` (same for DELETE) so even a bug can’t rewrite history.
- `src/lib/audit.ts`: `audit(auth, action, objectType, objectId, meta)` — called
  from mutating handlers (create/update/delete/stage_change) and auth events
  (login, key mint/revoke, member change).
- `GET /api/audit` (admin) with pagination + CSV export.

### B3 acceptance
- `tests/rbac-matrix.test.ts` (allow/deny per role×endpoint) green.
- `tests/audit-log.test.ts`: a mutation writes an audit row; `UPDATE`/`DELETE`
  on `audit_log` as `fourty_app` are rejected/no-ops; export returns rows.
- Isolation suite still green; reversibility test updated. Commit
  `gate(B3): … — evidence: rbac-matrix.test.ts, audit-log.test.ts`.

---

## Gate B4 — Workers/queue + rate limit + observability + backup drill — ✅ DONE

> **Done (2026-07-08).** Delivered per this plan: pg-boss queue (`src/lib/queue.ts`,
> own `pgboss` schema, `inline`/`pgboss` drivers) + standalone worker
> (`src/worker/`, `npm run worker`, Compose `worker` service); webhook delivery +
> workflow dispatch moved off the request path with retry/backoff/dead-letter;
> `job_receipts` idempotency ledger (`0005_queue`) → **exactly-once proven by a
> SIGKILL-mid-run worker test**. Whole-API rate limit in `withAuth`
> (`RateLimit-*`/`Retry-After`, per-route budgets). `pino` request-scoped logs +
> `GET /metrics` (Prometheus: HTTP counter/histogram, DB-pool + queue-depth
> gauges) + optional OTel hook. `scripts/backup-drill.sh` **ran PASS (21 tables)**;
> `bench/zero-downtime.k6.js` authored. Evidence: `worker.test.ts`,
> `ratelimit.test.ts`, `metrics.test.ts`, 94/94 green, live E2E, backup-drill log.
> See `PROGRESS.md` § Gate B4. **Next: Gate B5.**

**Objective:** heavy/async work leaves the request path durably; the stack is
observable and its backups are proven.

### B4.1 Queue + worker (ADR-004: pg-boss)
- Add `pg-boss` (its own `pgboss` schema on the same Postgres — no Redis).
- `src/lib/queue.ts`: typed `enqueue(jobName, payload, { workspaceId, idempotencyKey })`.
- `src/worker/index.ts`: a standalone process (`npm run worker`) that registers
  handlers. **Move off the request path:** webhook delivery (currently
  fire-and-forget in `engine.ts`) and workflow actions → enqueue instead; the
  worker runs them with retry+exponential backoff and a dead-letter (max-retries)
  policy. Each job carries `workspaceId`; the handler runs inside
  `withWorkspace()` so RLS + audit still apply.
- Idempotency: a unique `idempotencyKey` per job; handler is safe under
  at-least-once delivery.
- Compose: add a `worker` service (same image, `command: npm run worker`).

### B4.2 Rate limiting (whole API surface)
- Generalize `src/lib/ratelimit.ts` into middleware applied in `withAuth`: keyed
  by API-key/user + IP, standard `RateLimit-*` + `Retry-After` headers, per-route
  budgets (read vs write vs bulk). Note the in-process limitation (ADR: single
  instance; front with a gateway for multi-replica).
- Tests: burst → 429 with headers; independent keys; window reset.

### B4.3 Observability
- `pino` structured logging; a request-scoped child logger carrying
  `request_id` + `workspace_id` (thread via the AsyncLocalStorage store already
  in `src/db/index.ts` — add `requestId`/`workspaceId` to it).
- `GET /metrics` (Prometheus text): HTTP latency histogram, request counter by
  route/status, DB pool gauges (`pool.totalCount/idleCount/waitingCount`), queue
  depth (pg-boss). Public but no PII.
- OTel: optional tracing hook behind `OTEL_EXPORTER_OTLP_ENDPOINT` (no-op if unset).

### B4.4 Backup/restore drill (real)
- `scripts/backup-drill.sh`: `pg_dump` → record per-table `count(*)` checksums →
  drop/recreate DB → `pg_restore` → re-check counts → assert equal → print a
  PASS/FAIL table. Wire a lightweight CI job (nightly) or a documented manual run;
  paste the output into `PROGRESS.md`.
- Zero-downtime demo: run a trivial expand migration while a small `k6` script
  drives `/api/contacts`; assert 0 failed requests. Script under `bench/`.

### B4 acceptance
- Worker kill test: enqueue N jobs, `SIGKILL` the worker mid-run, restart →
  every job completes exactly once (assert via idempotent side-effect counts).
- Rate-limit + `/metrics` tests green; `backup-drill.sh` output recorded.
- Commit `gate(B4): … — evidence: worker-*.test.ts, ratelimit-*.test.ts, backup drill log`.

---

## Gate B5 — Benchmark vs Twenty (same Postgres, honest numbers)

**Objective:** a reproducible, one-command head-to-head. No fabricated numbers —
publish losses.

### B5.1 Harness (`bench/`)
- `bench/docker-compose.bench.yml`: Fourty stack + a pinned **Twenty** release,
  each pinned to identical `cpus`/`memory` limits and comparable Postgres tuning
  (shared_buffers/work_mem), on the same host.
- `bench/seed.ts`: seed **via each product’s API** (not raw SQL) to `10k / 100k /
  1M` of contacts+companies+deals+activities+relations. Same logical dataset both
  sides. Publish the script.

### B5.2 Measurements
- API (`k6`): p50/p95/p99 + throughput for list / filter / sort / search /
  create / update / bulk — REST for both; add Twenty’s GraphQL where it’s the
  first-class path. Warm-up + fixed VUs/duration.
- UI (`Playwright` + Lighthouse): list view, kanban, record page load times;
  scroll 100k rows (virtualization check).
- Search latency at 1M rows; workflow trigger→action latency/throughput.
- Resource: RAM/CPU idle and under-load for each full stack (`docker stats`).

### B5.3 Output
- `bench/run.sh` → one command runs everything and writes `BENCHMARK.md`
  (markdown tables) + `bench/results/*.json` (raw). Each row cites the scenario,
  dataset size, and both products’ numbers. **Where Fourty loses, state it and
  add an optimization ticket.** A prior hypothesis (SQLite→Postgres removed the
  single-writer ceiling; Twenty’s worker fleet may win on concurrency/bulk) is to
  be *measured*, not assumed.

### B5 acceptance
- `bench/run.sh` reproduces the tables from clean; `BENCHMARK.md` committed with
  real numbers incl. any losses + analysis. Commit
  `gate(B5): benchmark vs Twenty — evidence: BENCHMARK.md + bench/results/`.

---

## After B5
Tier-2 parity/features resume (custom objects, GraphQL, saved-views UI, email/
calendar sync, i18n, a11y), then B6 (`@fourty/twenty-migrate`, native MCP server,
docs). Feature work stays frozen until B5 is published (mission rule).
