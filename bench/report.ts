/**
 * Benchmark report generator (Gate B5). Reads bench/results/*.json (produced by
 * run.sh: seed summaries, k6 scenario records, docker-stats snapshots) and
 * (re)writes BENCHMARK.md at the repo root. Numbers come ONLY from these files —
 * a product with no results renders "—" (not measured), never a fabricated value.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const RESULTS = path.join(ROOT, "bench", "results");

type K6Record = {
  scenario: string;
  vus: number;
  duration: string;
  http_reqs: number;
  rps: number;
  fail_rate: number;
  latency_ms: { p50: number; p90: number; p95: number; p99: number; avg: number; max: number };
};
type Seed = {
  target: string;
  size: number;
  counts: Record<string, number>;
  elapsedMs: number;
  insertsPerSec: number;
};
type Stats = {
  label: string;
  note?: string;
  containers: { name: string; cpu_peak: string; mem_peak_mib: number }[];
};

const SCENARIOS = ["list", "filter", "sort", "search", "create", "update"];
const TARGETS = ["fourty", "twenty"] as const;

type Bucket = { k6: Record<string, K6Record>; seed?: Seed; stats?: Stats };
const data: Record<number, Record<string, Bucket>> = {};

function bucket(size: number, target: string): Bucket {
  data[size] ??= {};
  data[size][target] ??= { k6: {} };
  return data[size][target];
}

if (existsSync(RESULTS)) {
  for (const f of readdirSync(RESULTS)) {
    const m = /^(fourty|twenty)-(\d+)-(.+)\.json$/.exec(f);
    if (!m) continue;
    const [, target, sizeStr, suffix] = m;
    const size = Number(sizeStr);
    const content = JSON.parse(readFileSync(path.join(RESULTS, f), "utf8"));
    if (suffix === "seed") bucket(size, target).seed = content;
    else if (suffix === "stats") bucket(size, target).stats = content;
    else if (SCENARIOS.includes(suffix)) bucket(size, target).k6[suffix] = content;
  }
}

const num = (v: number | undefined, digits = 1) =>
  v === undefined || Number.isNaN(v) ? "—" : v.toFixed(digits);

function scenarioTable(size: number): string {
  const rows: string[] = [];
  rows.push("| Scenario | Metric | Fourty | Twenty |");
  rows.push("|---|---|---:|---:|");
  for (const s of SCENARIOS) {
    const f = data[size]?.fourty?.k6[s];
    const t = data[size]?.twenty?.k6[s];
    const cell = (r: K6Record | undefined, get: (r: K6Record) => number) =>
      r ? num(get(r)) : "—";
    rows.push(`| **${s}** | throughput (req/s) | ${cell(f, (r) => r.rps)} | ${cell(t, (r) => r.rps)} |`);
    rows.push(`| | p50 latency (ms) | ${cell(f, (r) => r.latency_ms.p50)} | ${cell(t, (r) => r.latency_ms.p50)} |`);
    rows.push(`| | p95 latency (ms) | ${cell(f, (r) => r.latency_ms.p95)} | ${cell(t, (r) => r.latency_ms.p95)} |`);
    rows.push(`| | p99 latency (ms) | ${cell(f, (r) => r.latency_ms.p99)} | ${cell(t, (r) => r.latency_ms.p99)} |`);
    rows.push(`| | error rate (%) | ${cell(f, (r) => r.fail_rate * 100)} | ${cell(t, (r) => r.fail_rate * 100)} |`);
  }
  return rows.join("\n");
}

function ingestTable(size: number): string {
  const rows: string[] = ["| Product | Rows seeded | Wall time (s) | Inserts/s |", "|---|---:|---:|---:|"];
  for (const target of TARGETS) {
    const seed = data[size]?.[target]?.seed;
    if (!seed) {
      rows.push(`| ${target} | — | — | — |`);
      continue;
    }
    const total = Object.values(seed.counts).reduce((a, b) => a + b, 0);
    rows.push(`| ${target} | ${total} | ${num(seed.elapsedMs / 1000)} | ${seed.insertsPerSec} |`);
  }
  return rows.join("\n");
}

function resourceTable(size: number): string {
  const rows: string[] = ["| Container | CPU (peak) | Memory (peak) |", "|---|---:|---:|"];
  let any = false;
  for (const target of TARGETS) {
    const stats = data[size]?.[target]?.stats;
    for (const c of stats?.containers ?? []) {
      any = true;
      rows.push(`| ${c.name} | ${c.cpu_peak} | ${c.mem_peak_mib} MiB |`);
    }
  }
  return any
    ? rows.join("\n") + "\n\n_Peak values sampled under sustained list-scenario load._"
    : "_No resource snapshot captured._";
}

/** Observations derived from the numbers (never hand-typed → never stale). */
function observations(size: number): string[] {
  const f = data[size]?.fourty;
  if (!f || Object.keys(f.k6).length === 0) return [];
  const recs = Object.values(f.k6);
  const notes: string[] = [];

  const worstFail = Math.max(...recs.map((r) => r.fail_rate));
  notes.push(
    worstFail === 0
      ? `**Zero errors** across all ${recs.length} scenarios at ${recs[0].vus} VUs.`
      : `Peak error rate ${(worstFail * 100).toFixed(2)}% — investigate before trusting throughput.`,
  );

  const worstP95 = Math.max(...recs.map((r) => r.latency_ms.p95));
  const worstP99 = Math.max(...recs.map((r) => r.latency_ms.p99));
  notes.push(`Worst-case latency across scenarios: p95 ${worstP95.toFixed(1)}ms, p99 ${worstP99.toFixed(1)}ms.`);

  const byRps = [...recs].sort((a, b) => b.rps - a.rps);
  notes.push(
    `Fastest: **${byRps[0].scenario}** (${Math.round(byRps[0].rps)} req/s); slowest: **${byRps[byRps.length - 1].scenario}** (${Math.round(byRps[byRps.length - 1].rps)} req/s).`,
  );

  const cs = f.stats?.containers ?? [];
  const cpu = (pred: (n: string) => boolean) => {
    const c = cs.find((x) => pred(x.name));
    return c ? parseFloat(c.cpu_peak) : undefined;
  };
  const dbCpu = cpu((n) => n.includes("pg"));
  const appCpu = cpu((n) => n.includes("app"));
  if (dbCpu !== undefined && appCpu !== undefined) {
    notes.push(
      dbCpu > appCpu
        ? `Under read load the **database is the CPU-bound component** (peak ${dbCpu.toFixed(0)}% vs the app tier's ${appCpu.toFixed(0)}%) — at this scale Postgres query execution, not the Node app, is the ceiling.`
        : `The **app tier is the CPU-bound component** (peak ${appCpu.toFixed(0)}% vs the DB's ${dbCpu.toFixed(0)}%).`,
    );
  }
  return notes;
}

const sizes = Object.keys(data)
  .map(Number)
  .sort((a, b) => a - b);

const hasTwenty = sizes.some((s) => data[s]?.twenty && Object.keys(data[s].twenty.k6).length > 0);

const out: string[] = [];
out.push("# BENCHMARK — Fourty vs Twenty");
out.push("");
out.push(
  "> Reproduce every number here with `bench/run.sh` (Gate B5). No value is hand-written:",
  "> `bench/report.ts` renders it straight from `bench/results/*.json`. A product with no",
  "> results shows `—` (not measured) rather than an invented number.",
);
out.push("");
out.push(`_Generated: ${new Date().toISOString()}_`);
out.push("");

out.push("## Methodology");
out.push("");
out.push(
  "- **Same host, matched limits.** Both stacks run from `bench/docker-compose.bench.yml`",
  "  one at a time under identical cpu/memory limits (DB 4cpu/4g, app 4cpu/4g, worker",
  "  2cpu/2g) and the same Postgres tuning (`shared_buffers=1GB`, `work_mem=32MB`,",
  "  `effective_cache_size=3GB`). Twenty additionally runs Redis (1cpu/1g) — part of its",
  "  architecture, counted in its footprint.",
  "- **Seeded via each product's API** (`bench/seed.ts`): Fourty over REST, Twenty over",
  "  GraphQL (its first-class API) — same logical dataset (companies=SIZE/10, contacts=SIZE,",
  "  deals=SIZE/2). Activities (SIZE/10) are Fourty-only — Twenty has no directly equivalent",
  "  timeline object, so they're excluded from the comparison rather than faked.",
  "- **Load**: k6 over REST for both — `bench/k6/api.js` hits Fourty's `/api/contacts`,",
  "  `bench/k6/twenty.js` hits Twenty's `/rest/people` (`depth=0` for a flat list, matching",
  "  Fourty). 5s warm-up then fixed VUs for a fixed duration per scenario. Fourty's in-process",
  "  rate limiter is raised out of the way so raw throughput is measured (Twenty has none).",
  "- **Honesty**: where Fourty loses, it is stated with an optimization note — losses are",
  "  published, not hidden (repo anti-vanity rule).",
);
out.push("");

if (sizes.length === 0) {
  out.push("## Results");
  out.push("");
  out.push("_No results yet. Run `bench/run.sh fourty` (and `bench/run.sh twenty`) to populate._");
} else {
  for (const size of sizes) {
    out.push(`## Dataset: ${size.toLocaleString("en-US")} contacts`);
    out.push("");
    out.push("### API latency & throughput");
    out.push("");
    out.push(scenarioTable(size));
    out.push("");
    out.push("### Ingest (seed via API)");
    out.push("");
    out.push(ingestTable(size));
    out.push("");
    out.push("### Resource use under load (`docker stats`)");
    out.push("");
    out.push(resourceTable(size));
    out.push("");
    const obs = observations(size);
    if (obs.length) {
      out.push("### Observations (Fourty baseline)");
      out.push("");
      for (const o of obs) out.push(`- ${o}`);
      out.push("");
    }
  }
}

out.push("## Comparison & losses");
out.push("");
if (!hasTwenty) {
  out.push(
    "**Twenty not yet measured in this run.** The harness (compose, seed, k6, run.sh) is",
    "complete and reproducible; the Twenty column is `—` until `bench/run.sh twenty` is run",
    "against the pinned images with a workspace token. No Twenty numbers are invented here.",
    "",
    "Once both sides are measured, this section enumerates every scenario where Fourty is",
    "slower than Twenty, with a one-line cause and an optimization ticket.",
  );
  out.push("");
} else {
  for (const size of sizes) {
    const f = data[size]?.fourty?.k6;
    const t = data[size]?.twenty?.k6;
    if (!f || !t || Object.keys(f).length === 0 || Object.keys(t).length === 0) continue;
    out.push(`### ${size.toLocaleString("en-US")} contacts — head-to-head`);
    out.push("");
    out.push("| Scenario | Fourty req/s | Twenty req/s | Higher | Fourty p95 (ms) | Twenty p95 (ms) | Lower p95 |");
    out.push("|---|--:|--:|:--:|--:|--:|:--:|");
    const losses: string[] = [];
    for (const s of SCENARIOS) {
      const fr = f[s];
      const tr = t[s];
      if (!fr || !tr) continue;
      const rpsWin = fr.rps >= tr.rps ? "Fourty" : "**Twenty**";
      const p95Win = fr.latency_ms.p95 <= tr.latency_ms.p95 ? "Fourty" : "**Twenty**";
      out.push(
        `| ${s} | ${Math.round(fr.rps)} | ${Math.round(tr.rps)} | ${rpsWin} | ${fr.latency_ms.p95.toFixed(1)} | ${tr.latency_ms.p95.toFixed(1)} | ${p95Win} |`,
      );
      if (tr.rps > fr.rps)
        losses.push(
          `**${s}** throughput: Twenty ${Math.round(tr.rps)} vs Fourty ${Math.round(fr.rps)} req/s (${(tr.rps / fr.rps).toFixed(2)}×).`,
        );
      else if (tr.latency_ms.p95 < fr.latency_ms.p95)
        losses.push(
          `**${s}** p95: Twenty ${tr.latency_ms.p95.toFixed(1)}ms vs Fourty ${fr.latency_ms.p95.toFixed(1)}ms (throughput still Fourty's).`,
        );
    }
    out.push("");
    // Total memory footprint per stack under load (sum of container peaks).
    const memSum = (target: string) =>
      (data[size]?.[target]?.stats?.containers ?? []).reduce((a, c) => a + c.mem_peak_mib, 0);
    const fMem = memSum("fourty");
    const tMem = memSum("twenty");
    if (fMem > 0 && tMem > 0) {
      out.push(
        `**Footprint under load:** Fourty ~${fMem} MiB across ${data[size].fourty.stats?.containers.length} containers vs Twenty ~${tMem} MiB across ${data[size].twenty.stats?.containers.length} (${(tMem / fMem).toFixed(1)}×) — Twenty's Redis + worker + richer server are part of its architecture.`,
      );
      out.push("");
    }
    if (losses.length) {
      out.push("**Where Fourty loses (publish, don't hide):**");
      for (const l of losses) out.push(`- ${l}`);
      out.push("- → optimization ticket: profile the losing query path; check indexes + N+1 in the handler.");
    } else {
      out.push("**Fourty matches or beats Twenty on every measured scenario** (throughput and p95).");
    }
    out.push("");
    out.push(
      "_Caveat: same protocol (REST) and dataset shape both sides; Twenty adds Redis + a worker" +
        " (its architecture) and runs GraphQL as its first-class API — REST is its auto-generated" +
        " equivalent. Numbers are one host, one run; re-run for stability._",
    );
    out.push("");
  }
}

writeFileSync(path.join(ROOT, "BENCHMARK.md"), out.join("\n") + "\n");
process.stdout.write(`BENCHMARK.md written (${sizes.length} dataset size(s)).\n`);
