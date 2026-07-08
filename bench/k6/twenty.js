// Parametrized k6 load test for Twenty's REST API (Gate B5) — mirrors
// bench/k6/api.js (Fourty) scenario-for-scenario so the two are comparable on the
// same protocol (REST). Twenty's GraphQL is its first-class API; REST is the
// auto-generated equivalent over the same resolvers, chosen here for apples-to-
// apples with Fourty's REST. `depth=0` avoids relation joins so list latency
// measures the base query, matching Fourty's flat list.
//
//   SCENARIO=list VUS=20 DURATION=20s BASE_URL=http://localhost:3201 \
//     API_KEY=<twenty access token> RESULT_FILE=bench/results/twenty-10000-list.json \
//     k6 run bench/k6/twenty.js
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:3201").replace(/\/$/, "");
const TOKEN = __ENV.API_KEY || "";
const SCENARIO = __ENV.SCENARIO || "list";
const VUS = Number(__ENV.VUS || 20);
const DURATION = __ENV.DURATION || "20s";
const PEOPLE = `${BASE_URL}/rest/people`;

const authHeaders = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const enc = encodeURIComponent;

export const options = {
  scenarios: {
    warmup: { executor: "constant-vus", vus: 3, duration: "5s", exec: "run" },
    measure: { executor: "constant-vus", vus: VUS, duration: DURATION, startTime: "5s", exec: "run" },
  },
  summaryTrendStats: ["avg", "min", "med", "p(50)", "p(90)", "p(95)", "p(99)", "max"],
  thresholds: { http_req_failed: ["rate<0.01"] },
};

export function setup() {
  if (SCENARIO !== "update") return { ids: [] };
  const res = http.get(`${PEOPLE}?limit=200&depth=0`, { headers: authHeaders });
  const ids = (res.json("data.people") || []).map((p) => p.id);
  return { ids };
}

export function run(data) {
  let res;
  switch (SCENARIO) {
    case "filter":
      res = http.get(`${PEOPLE}?filter=${enc("jobTitle[eq]:CTO")}&limit=50&depth=0`, { headers: authHeaders });
      break;
    case "sort":
      res = http.get(`${PEOPLE}?orderBy=${enc("createdAt[DescNullsLast]")}&limit=50&depth=0`, { headers: authHeaders });
      break;
    case "search": {
      const q = `First${Math.floor(Math.random() * 1000)}`;
      res = http.get(`${PEOPLE}?filter=${enc(`name.firstName[ilike]:%${q}%`)}&limit=50&depth=0`, { headers: authHeaders });
      break;
    }
    case "create":
      res = http.post(
        PEOPLE,
        JSON.stringify({ name: { firstName: "Load", lastName: `Test${__ITER}` }, emails: { primaryEmail: `load${__VU}-${__ITER}@bench.test` } }),
        { headers: authHeaders },
      );
      break;
    case "update": {
      const ids = (data && data.ids) || [];
      if (ids.length === 0) return;
      const id = ids[Math.floor(Math.random() * ids.length)];
      res = http.patch(`${PEOPLE}/${id}`, JSON.stringify({ jobTitle: `Updated ${__ITER}` }), { headers: authHeaders });
      break;
    }
    case "list":
    default:
      res = http.get(`${PEOPLE}?limit=50&depth=0`, { headers: authHeaders });
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
    latency_ms: { p50: d["p(50)"], p90: d["p(90)"], p95: d["p(95)"], p99: d["p(99)"], avg: d.avg, max: d.max },
  };
  if (file) out[file] = JSON.stringify(record, null, 2);
  out.stdout = `\n[twenty:${SCENARIO}] reqs=${record.http_reqs} rps=${(record.rps || 0).toFixed(0)} p50=${(record.latency_ms.p50 || 0).toFixed(1)}ms p95=${(record.latency_ms.p95 || 0).toFixed(1)}ms p99=${(record.latency_ms.p99 || 0).toFixed(1)}ms fail=${((record.fail_rate || 0) * 100).toFixed(2)}%\n`;
  return out;
}
