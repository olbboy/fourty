// Parametrized k6 API load test (Gate B5). One scenario per run, selected by the
// SCENARIO env, against Fourty's REST API. Reports p50/p90/p95/p99 latency +
// throughput (http_reqs). Warm-up is a short low-VU ramp; the measured stage is
// fixed VUs for a fixed duration.
//
//   SCENARIO=list VUS=20 DURATION=20s BASE_URL=http://localhost:3200 \
//     API_KEY=frty_xxx RESULT_FILE=bench/results/fourty-10k-list.json \
//     k6 run bench/k6/api.js
//
// Scenarios: list | filter | sort | search | create | update
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:3200").replace(/\/$/, "");
const API_KEY = __ENV.API_KEY || "";
const SCENARIO = __ENV.SCENARIO || "list";
const VUS = Number(__ENV.VUS || 20);
const DURATION = __ENV.DURATION || "20s";

const authHeaders = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };

export const options = {
  scenarios: {
    warmup: { executor: "constant-vus", vus: 3, duration: "5s", tags: { phase: "warmup" }, exec: "run" },
    measure: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
      startTime: "5s",
      tags: { phase: "measure" },
      exec: "run",
    },
  },
  summaryTrendStats: ["avg", "min", "med", "p(50)", "p(90)", "p(95)", "p(99)", "max"],
  thresholds: { http_req_failed: ["rate<0.01"] },
};

// Fetch a page of contact ids once, for the update scenario.
export function setup() {
  if (SCENARIO !== "update") return { ids: [] };
  const res = http.get(`${BASE_URL}/api/contacts?limit=200`, { headers: authHeaders });
  const ids = (res.json("contacts") || []).map((c) => c.id);
  return { ids };
}

export function run(data) {
  let res;
  switch (SCENARIO) {
    case "filter":
      res = http.get(`${BASE_URL}/api/contacts?status=qualified&limit=50`, { headers: authHeaders });
      break;
    case "sort":
      res = http.get(`${BASE_URL}/api/contacts?sort=score&limit=50`, { headers: authHeaders });
      break;
    case "search": {
      const q = `First${Math.floor(Math.random() * 1000)}`;
      res = http.get(`${BASE_URL}/api/search?q=${q}`, { headers: authHeaders });
      break;
    }
    case "create":
      res = http.post(
        `${BASE_URL}/api/contacts`,
        JSON.stringify({ firstName: "Load", lastName: `Test${__ITER}`, email: `load${__VU}-${__ITER}@bench.test` }),
        { headers: authHeaders },
      );
      break;
    case "update": {
      const ids = (data && data.ids) || [];
      if (ids.length === 0) return;
      const id = ids[Math.floor(Math.random() * ids.length)];
      res = http.patch(`${BASE_URL}/api/contacts/${id}`, JSON.stringify({ jobTitle: `Updated ${__ITER}` }), {
        headers: authHeaders,
      });
      break;
    }
    case "list":
    default:
      res = http.get(`${BASE_URL}/api/contacts?limit=50`, { headers: authHeaders });
      break;
  }
  check(res, { "status 2xx": (r) => r.status >= 200 && r.status < 300 });
}

export function handleSummary(data) {
  const out = {};
  const file = __ENV.RESULT_FILE;
  const d = data.metrics.http_req_duration ? data.metrics.http_req_duration.values : {};
  const reqs = data.metrics.http_reqs ? data.metrics.http_reqs.values : {};
  const failed = data.metrics.http_req_failed ? data.metrics.http_req_failed.values : {};
  const record = {
    scenario: SCENARIO,
    vus: VUS,
    duration: DURATION,
    http_reqs: reqs.count,
    rps: reqs.rate,
    fail_rate: failed.rate,
    latency_ms: {
      p50: d["p(50)"],
      p90: d["p(90)"],
      p95: d["p(95)"],
      p99: d["p(99)"],
      avg: d.avg,
      max: d.max,
    },
  };
  if (file) out[file] = JSON.stringify(record, null, 2);
  out.stdout = `\n[${SCENARIO}] reqs=${record.http_reqs} rps=${(record.rps || 0).toFixed(0)} p50=${(record.latency_ms.p50 || 0).toFixed(1)}ms p95=${(record.latency_ms.p95 || 0).toFixed(1)}ms p99=${(record.latency_ms.p99 || 0).toFixed(1)}ms fail=${((record.fail_rate || 0) * 100).toFixed(2)}%\n`;
  return out;
}
