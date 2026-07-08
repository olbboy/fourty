# BENCHMARK — Fourty vs Twenty

> Reproduce every number here with `bench/run.sh` (Gate B5). No value is hand-written:
> `bench/report.ts` renders it straight from `bench/results/*.json`. A product with no
> results shows `—` (not measured) rather than an invented number.

_Generated: 2026-07-08T02:06:51.649Z_

## Methodology

- **Same host, matched limits.** Both stacks run from `bench/docker-compose.bench.yml`
  one at a time under identical cpu/memory limits (DB 4cpu/4g, app 4cpu/4g, worker
  2cpu/2g) and the same Postgres tuning (`shared_buffers=1GB`, `work_mem=32MB`,
  `effective_cache_size=3GB`). Twenty additionally runs Redis (1cpu/1g) — part of its
  architecture, counted in its footprint.
- **Seeded via each product's API** (`bench/seed.ts`): Fourty over REST, Twenty over
  GraphQL (its first-class API) — same logical dataset (companies=SIZE/10, contacts=SIZE,
  deals=SIZE/2). Activities (SIZE/10) are Fourty-only — Twenty has no directly equivalent
  timeline object, so they're excluded from the comparison rather than faked.
- **Load**: k6 over REST for both — `bench/k6/api.js` hits Fourty's `/api/contacts`,
  `bench/k6/twenty.js` hits Twenty's `/rest/people` (`depth=0` for a flat list, matching
  Fourty). 5s warm-up then fixed VUs for a fixed duration per scenario. Fourty's in-process
  rate limiter is raised out of the way so raw throughput is measured (Twenty has none).
- **Honesty**: where Fourty loses, it is stated with an optimization note — losses are
  published, not hidden (repo anti-vanity rule).

## Dataset: 10,000 contacts

### API latency & throughput

| Scenario | Metric | Fourty | Twenty |
|---|---|---:|---:|
| **list** | throughput (req/s) | 756.1 | 191.2 |
| | p50 latency (ms) | 21.2 | 98.6 |
| | p95 latency (ms) | 34.9 | 136.0 |
| | p99 latency (ms) | 40.6 | 159.1 |
| | error rate (%) | 0.0 | 0.0 |
| **filter** | throughput (req/s) | 997.8 | 818.8 |
| | p50 latency (ms) | 17.2 | 21.5 |
| | p95 latency (ms) | 23.4 | 28.9 |
| | p99 latency (ms) | 29.6 | 34.5 |
| | error rate (%) | 0.0 | 0.0 |
| **sort** | throughput (req/s) | 867.8 | 184.6 |
| | p50 latency (ms) | 18.8 | 100.7 |
| | p95 latency (ms) | 30.1 | 138.6 |
| | p99 latency (ms) | 36.3 | 175.5 |
| | error rate (%) | 0.0 | 0.0 |
| **search** | throughput (req/s) | 639.4 | 325.2 |
| | p50 latency (ms) | 25.0 | 54.1 |
| | p95 latency (ms) | 46.1 | 77.8 |
| | p99 latency (ms) | 55.4 | 98.5 |
| | error rate (%) | 0.0 | 0.0 |
| **create** | throughput (req/s) | 688.9 | 286.8 |
| | p50 latency (ms) | 25.5 | 61.4 |
| | p95 latency (ms) | 31.1 | 85.5 |
| | p99 latency (ms) | 39.0 | 113.7 |
| | error rate (%) | 0.0 | 0.0 |
| **update** | throughput (req/s) | 626.2 | 363.6 |
| | p50 latency (ms) | 28.0 | 48.1 |
| | p95 latency (ms) | 34.7 | 66.1 |
| | p99 latency (ms) | 42.6 | 85.1 |
| | error rate (%) | 0.0 | 0.0 |

### Ingest (seed via API)

| Product | Rows seeded | Wall time (s) | Inserts/s |
|---|---:|---:|---:|
| fourty | 17000 | 24.4 | 697 |
| twenty | 16000 | 37.3 | 429 |

### Resource use under load (`docker stats`)

| Container | CPU (peak) | Memory (peak) |
|---|---:|---:|
| bench-bench-fourty-app-1 | 59.8% | 520 MiB |
| bench-bench-fourty-worker-1 | 0.3% | 122 MiB |
| bench-bench-pg-fourty-1 | 404.5% | 188 MiB |
| bench-bench-twenty-worker-1 | 116.0% | 1023 MiB |
| bench-bench-twenty-server-1 | 118.3% | 1454 MiB |
| bench-bench-pg-twenty-1 | 104.8% | 318 MiB |
| bench-bench-redis-twenty-1 | 27.1% | 252 MiB |

_Peak values sampled under sustained list-scenario load._

### Observations (Fourty baseline)

- **Zero errors** across all 6 scenarios at 20 VUs.
- Worst-case latency across scenarios: p95 46.1ms, p99 55.4ms.
- Fastest: **filter** (998 req/s); slowest: **update** (626 req/s).
- Under read load the **database is the CPU-bound component** (peak 405% vs the app tier's 60%) — at this scale Postgres query execution, not the Node app, is the ceiling.

## Comparison & losses

### 10,000 contacts — head-to-head

| Scenario | Fourty req/s | Twenty req/s | Higher | Fourty p95 (ms) | Twenty p95 (ms) | Lower p95 |
|---|--:|--:|:--:|--:|--:|:--:|
| list | 756 | 191 | Fourty | 34.9 | 136.0 | Fourty |
| filter | 998 | 819 | Fourty | 23.4 | 28.9 | Fourty |
| sort | 868 | 185 | Fourty | 30.1 | 138.6 | Fourty |
| search | 639 | 325 | Fourty | 46.1 | 77.8 | Fourty |
| create | 689 | 287 | Fourty | 31.1 | 85.5 | Fourty |
| update | 626 | 364 | Fourty | 34.7 | 66.1 | Fourty |

**Footprint under load:** Fourty ~830 MiB across 3 containers vs Twenty ~3047 MiB across 4 (3.7×) — Twenty's Redis + worker + richer server are part of its architecture.

**Fourty matches or beats Twenty on every measured scenario** (throughput and p95).

_Caveat: same protocol (REST) and dataset shape both sides; Twenty adds Redis + a worker (its architecture) and runs GraphQL as its first-class API — REST is its auto-generated equivalent. Numbers are one host, one run; re-run for stability._

