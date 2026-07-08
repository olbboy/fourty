# Gate B5 — Benchmark vs Twenty (same Postgres, honest numbers)

Status: DONE @10k (both stacks measured) · 2026-07-08
Delivered: full reproducible harness + REAL head-to-head @10k. Twenty stood up
(v2.18, postgres:16), auth flow cracked (twenty-bootstrap.mjs), seeded via
GraphQL, k6 REST matrix. Result: 0 errors both sides, Fourty wins every scenario
(list 756 vs 191 rps; sort 868 vs 185; filter closest 998 vs 819), ~830 vs
~3047 MiB footprint. BENCHMARK.md + bench/results/*.json (16 files). No fabricated
numbers. 100k/1M supported by same harness, not yet run.

## Deliverables (harness — reproducible)
- `bench/docker-compose.bench.yml` — Fourty stack + Twenty stack, identical
  cpu/memory limits + comparable PG tuning; `profiles: [fourty|twenty]` so a
  stack runs in isolation under equal limits.
- `bench/seed.ts` — seed **via each product's API** (Fourty REST, Twenty GraphQL)
  to N contacts+companies+deals+activities with relations. `SIZE`-parametrized.
- `bench/k6/api.js` — k6 scenarios: list/filter/sort/search/create/update, p50/
  p95/p99 + throughput, warm-up + fixed VUs/duration.
- `bench/run.sh` — one command: up a stack → wait healthy → bootstrap key →
  seed → warm-up → run k6 matrix → capture `docker stats` → write
  `bench/results/*.json` + regenerate `BENCHMARK.md` tables.
- `BENCHMARK.md` (repo root) — methodology + tables; Fourty real numbers where
  measured, Twenty marked "reproduce via run.sh" until run. Losses stated.

## Anti-vanity (non-negotiable)
- No number in BENCHMARK.md without a `bench/results/*.json` produced by run.sh.
- Twenty numbers stay empty/"not measured" until actually run — never invented.

## This session
- Run Fourty @10k for real → publish its numbers + validate the harness.
- Twenty: author the stack; run only if time permits, else document reproduce.

## Acceptance (gate)
- `bench/run.sh` reproduces tables from clean; `BENCHMARK.md` with real numbers
  incl. losses + analysis; commit `gate(B5): … — evidence: BENCHMARK.md + results`.
