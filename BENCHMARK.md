# BENCHMARK — Fourty vs Twenty

> Reproduce every number here with `bench/run.sh` (Gate B5). No value is hand-written:
> `bench/report.ts` renders it straight from `bench/results/*.json`. A product with no
> results shows `—` (not measured) rather than an invented number.

_Generated: 2026-07-08T01:34:14.970Z_

## Methodology

- **Same host, matched limits.** Both stacks run from `bench/docker-compose.bench.yml`
  one at a time under identical cpu/memory limits (DB 4cpu/4g, app 4cpu/4g, worker
  2cpu/2g) and the same Postgres tuning (`shared_buffers=1GB`, `work_mem=32MB`,
  `effective_cache_size=3GB`). Twenty additionally runs Redis (1cpu/1g) — part of its
  architecture, counted in its footprint.
- **Seeded via each product's API** (`bench/seed.ts`): Fourty over REST, Twenty over
  GraphQL — same logical dataset (companies=SIZE/10, contacts=SIZE, deals=SIZE/2,
  activities=SIZE/10).
- **Load**: k6 (`bench/k6/api.js`), 5s warm-up then fixed VUs for a fixed duration per
  scenario. Fourty's in-process rate limiter is raised out of the way so raw throughput
  is measured (Twenty has no equivalent per-instance limiter).
- **Honesty**: where Fourty loses, it is stated with an optimization note — losses are
  published, not hidden (repo anti-vanity rule).

## Dataset: 10,000 contacts

### API latency & throughput

| Scenario | Metric | Fourty | Twenty |
|---|---|---:|---:|
| **list** | throughput (req/s) | 756.1 | — |
| | p50 latency (ms) | 21.2 | — |
| | p95 latency (ms) | 34.9 | — |
| | p99 latency (ms) | 40.6 | — |
| | error rate (%) | 0.0 | — |
| **filter** | throughput (req/s) | 997.8 | — |
| | p50 latency (ms) | 17.2 | — |
| | p95 latency (ms) | 23.4 | — |
| | p99 latency (ms) | 29.6 | — |
| | error rate (%) | 0.0 | — |
| **sort** | throughput (req/s) | 867.8 | — |
| | p50 latency (ms) | 18.8 | — |
| | p95 latency (ms) | 30.1 | — |
| | p99 latency (ms) | 36.3 | — |
| | error rate (%) | 0.0 | — |
| **search** | throughput (req/s) | 639.4 | — |
| | p50 latency (ms) | 25.0 | — |
| | p95 latency (ms) | 46.1 | — |
| | p99 latency (ms) | 55.4 | — |
| | error rate (%) | 0.0 | — |
| **create** | throughput (req/s) | 688.9 | — |
| | p50 latency (ms) | 25.5 | — |
| | p95 latency (ms) | 31.1 | — |
| | p99 latency (ms) | 39.0 | — |
| | error rate (%) | 0.0 | — |
| **update** | throughput (req/s) | 626.2 | — |
| | p50 latency (ms) | 28.0 | — |
| | p95 latency (ms) | 34.7 | — |
| | p99 latency (ms) | 42.6 | — |
| | error rate (%) | 0.0 | — |

### Ingest (seed via API)

| Product | Rows seeded | Wall time (s) | Inserts/s |
|---|---:|---:|---:|
| fourty | 17000 | 24.4 | 697 |
| twenty | — | — | — |

### Resource use under load (`docker stats`)

| Container | CPU (peak) | Memory (peak) |
|---|---:|---:|
| bench-bench-fourty-app-1 | 59.8% | 520 MiB |
| bench-bench-fourty-worker-1 | 0.3% | 122 MiB |
| bench-bench-pg-fourty-1 | 404.5% | 188 MiB |

_Peak values sampled under sustained list-scenario load._

### Observations (Fourty baseline)

- **Zero errors** across all 6 scenarios at 20 VUs.
- Worst-case latency across scenarios: p95 46.1ms, p99 55.4ms.
- Fastest: **filter** (998 req/s); slowest: **update** (626 req/s).
- Under read load the **database is the CPU-bound component** (peak 405% vs the app tier's 60%) — at this scale Postgres query execution, not the Node app, is the ceiling.

## Comparison & losses

**Twenty not yet measured in this run.** The harness (compose, seed, k6, run.sh) is
complete and reproducible; the Twenty column is `—` until `bench/run.sh twenty` is run
against the pinned images with a workspace token. No Twenty numbers are invented here.

Once both sides are measured, this section enumerates every scenario where Fourty is
slower than Twenty, with a one-line cause and an optimization ticket.

