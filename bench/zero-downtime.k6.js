// Zero-downtime expand-migration drill (Gate B4, ADR-002/006).
//
// Drives GET /api/contacts continuously while an ADDITIVE ("expand") migration
// runs against the same Postgres. A well-formed expand migration (ADD COLUMN,
// CREATE INDEX CONCURRENTLY, new table) takes no blocking lock that stalls
// reads, so the API should serve every request with zero failures.
//
// Run:
//   BASE_URL=http://localhost:3000 API_KEY=frty_xxx k6 run bench/zero-downtime.k6.js
//   # ...and, mid-run, apply a trivial expand migration in another shell, e.g.:
//   #   psql "$MIGRATE_DATABASE_URL" -c \
//   #     "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zdt_probe text;"
//   #   psql "$MIGRATE_DATABASE_URL" -c \
//   #     "ALTER TABLE contacts DROP COLUMN IF EXISTS zdt_probe;"
//
// Pass criterion: http_req_failed rate == 0 (asserted by the threshold below).
import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const API_KEY = __ENV.API_KEY || "";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    // The whole point of the drill: not a single failed request during the
    // expand migration.
    http_req_failed: ["rate==0"],
    http_req_duration: ["p(95)<1000"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/contacts?limit=50`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  check(res, { "status is 200": (r) => r.status === 200 });
}
