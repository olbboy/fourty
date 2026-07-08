import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Whole-API rate limiting (Gate B4). Two layers: the fixed-window primitive
 * (deterministic, injected clock) and the withAuth integration (per caller + IP +
 * route class, standard RateLimit-* / Retry-After headers).
 */
describe("rate limit primitive", () => {
  let rateLimit: typeof import("@/lib/ratelimit").rateLimit;
  let __resetRateLimits: typeof import("@/lib/ratelimit").__resetRateLimits;

  beforeAll(async () => {
    ({ rateLimit, __resetRateLimits } = await import("@/lib/ratelimit"));
  });
  afterEach(() => __resetRateLimits());

  it("allows up to the limit then blocks, with reset/limit fields", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    const t0 = 1_000_000;
    expect(rateLimit("k", opts, t0)).toMatchObject({ allowed: true, limit: 3, remaining: 2 });
    expect(rateLimit("k", opts, t0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(rateLimit("k", opts, t0)).toMatchObject({ allowed: true, remaining: 0 });
    const blocked = rateLimit("k", opts, t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.remaining).toBe(0);
  });

  it("keys are independent", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(rateLimit("a", opts, 0).allowed).toBe(true);
    expect(rateLimit("b", opts, 0).allowed).toBe(true); // different key → own bucket
    expect(rateLimit("a", opts, 0).allowed).toBe(false);
  });

  it("resets after the window elapses", () => {
    const opts = { limit: 1, windowMs: 1_000 };
    expect(rateLimit("w", opts, 0).allowed).toBe(true);
    expect(rateLimit("w", opts, 500).allowed).toBe(false);
    expect(rateLimit("w", opts, 1_001).allowed).toBe(true); // new window
  });
});

describe("rate limit enforced through withAuth", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let __resetRateLimits: typeof import("@/lib/ratelimit").__resetRateLimits;
  let contactRoutes: typeof import("@/app/api/contacts/route");
  const KEY = "frty_rl_key";

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    ({ __resetRateLimits } = await import("@/lib/ratelimit"));
    contactRoutes = await import("@/app/api/contacts/route");
    const ws = await createWorkspace();
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "rl",
      prefix: "frty_rl",
      keyHash: sha256(KEY),
      createdAt: Date.now(),
    });
  });

  afterEach(() => {
    __resetRateLimits();
    delete process.env.RATELIMIT_READ;
  });

  const get = (ip: string) =>
    contactRoutes.GET(
      new Request("http://localhost/api/contacts", {
        headers: { Authorization: `Bearer ${KEY}`, "x-forwarded-for": ip },
      }),
    );

  it("returns 429 with RateLimit-* + Retry-After once the budget is spent", async () => {
    process.env.RATELIMIT_READ = "2"; // read budget = 2 requests/window
    __resetRateLimits(); // ensure the tighter budget starts clean

    const r1 = await get("10.1.1.1");
    expect(r1.status).toBe(200);
    expect(r1.headers.get("RateLimit-Limit")).toBe("2");
    expect(r1.headers.get("RateLimit-Remaining")).toBe("1");

    const r2 = await get("10.1.1.1");
    expect(r2.status).toBe(200);
    expect(r2.headers.get("RateLimit-Remaining")).toBe("0");

    const r3 = await get("10.1.1.1");
    expect(r3.status).toBe(429);
    expect(Number(r3.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(r3.headers.get("RateLimit-Remaining")).toBe("0");
  });

  it("buckets by client IP — a different IP has its own budget", async () => {
    process.env.RATELIMIT_READ = "1";
    __resetRateLimits();
    expect((await get("10.2.2.2")).status).toBe(200);
    expect((await get("10.2.2.2")).status).toBe(429); // same IP exhausted
    expect((await get("10.3.3.3")).status).toBe(200); // independent IP
  });
});
