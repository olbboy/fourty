import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Observability metrics (Gate B4): the Prometheus registry + the public /metrics
 * scrape endpoint. Asserts HTTP counters/histograms are recorded via withAuth,
 * DB-pool gauges are exposed, route cardinality is bounded (ids collapsed), and
 * the output carries no PII.
 */
describe("metrics registry", () => {
  let normalizeRoute: typeof import("@/lib/metrics").normalizeRoute;
  let recordHttp: typeof import("@/lib/metrics").recordHttp;
  let renderMetrics: typeof import("@/lib/metrics").renderMetrics;
  let __resetMetrics: typeof import("@/lib/metrics").__resetMetrics;

  beforeAll(async () => {
    ({ normalizeRoute, recordHttp, renderMetrics, __resetMetrics } = await import("@/lib/metrics"));
  });

  it("collapses 16-char ids but keeps collection names", () => {
    expect(normalizeRoute("/api/contacts/AbCd1234EfGh5678")).toBe("/api/contacts/:id");
    expect(normalizeRoute("/api/custom-fields")).toBe("/api/custom-fields"); // hyphen ≠ id
    expect(normalizeRoute("/api/deals")).toBe("/api/deals");
  });

  it("renders counter + histogram in Prometheus text", () => {
    __resetMetrics();
    recordHttp("/api/contacts", "GET", 200, 0.012);
    recordHttp("/api/contacts", "GET", 200, 0.4);
    const text = renderMetrics();
    expect(text).toContain('fourty_http_requests_total{route="/api/contacts",method="GET",status="200"} 2');
    expect(text).toContain("# TYPE fourty_http_request_duration_seconds histogram");
    expect(text).toContain('fourty_http_request_duration_seconds_count{route="/api/contacts",method="GET"} 2');
    expect(text).toMatch(/_bucket\{route="\/api\/contacts",method="GET",le="\+Inf"\} 2/);
  });

  it("renders dynamic gauges grouped with one HELP/TYPE", () => {
    __resetMetrics();
    const text = renderMetrics([
      { name: "fourty_db_pool_connections", help: "pool", value: 3, labels: { state: "total" } },
      { name: "fourty_db_pool_connections", help: "pool", value: 2, labels: { state: "idle" } },
    ]);
    expect((text.match(/# TYPE fourty_db_pool_connections gauge/g) ?? []).length).toBe(1);
    expect(text).toContain('fourty_db_pool_connections{state="idle"} 2');
  });
});

describe("/metrics endpoint", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let contactRoutes: typeof import("@/app/api/contacts/route");
  let metricsRoute: typeof import("@/app/api/metrics/route");
  const KEY = "frty_metrics_key";
  const SECRET_EMAIL = "secret-person@example.com";

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    contactRoutes = await import("@/app/api/contacts/route");
    metricsRoute = await import("@/app/api/metrics/route");
    const ws = await createWorkspace();
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "m",
      prefix: "frty_met",
      keyHash: sha256(KEY),
      createdAt: Date.now(),
    });
    const { withWorkspace } = await import("@/db");
    await withWorkspace(ws, async () => {
      const now = Date.now();
      await db.insert(tables.contacts).values({
        id: newId(),
        firstName: "Secret",
        lastName: "Person",
        email: SECRET_EMAIL,
        custom: "{}",
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  it("records a request then exposes counters + pool gauges, PII-free", async () => {
    // Drive one authenticated request so the counter/histogram have a sample.
    const r = await contactRoutes.GET(
      new Request("http://localhost/api/contacts", {
        headers: { Authorization: `Bearer ${KEY}`, "x-forwarded-for": "10.9.9.9" },
      }),
    );
    expect(r.status).toBe(200);

    const res = await metricsRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();

    expect(body).toContain("fourty_http_requests_total");
    expect(body).toContain('route="/api/contacts"');
    expect(body).toContain("fourty_http_request_duration_seconds_bucket");
    expect(body).toContain('fourty_db_pool_connections{state="total"}');
    // No PII: a tenant's contact email must never leak into a public scrape.
    expect(body).not.toContain(SECRET_EMAIL);
  });
});
