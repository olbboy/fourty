/**
 * Tiny in-process sliding-window rate limiter.
 *
 * Fourty is a single Node process by design (see README — no Redis, no queue),
 * so an in-memory limiter is architecturally consistent: it protects a single
 * instance against brute-force and abuse without extra infrastructure. It does
 * NOT coordinate across a horizontally-scaled fleet — if you run multiple
 * replicas behind a load balancer, put a shared limiter (e.g. nginx `limit_req`
 * or an API gateway) in front. That trade-off is documented, not hidden.
 */

type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Hit>();

export type RateLimitResult = {
  allowed: boolean;
  /** The configured ceiling for this window (for a `RateLimit-Limit` header). */
  limit: number;
  remaining: number;
  /** Seconds until the window resets (for `RateLimit-Reset`). */
  resetSeconds: number;
  /** Seconds until the caller may retry (for a `Retry-After` header; 0 if allowed). */
  retryAfter: number;
};

/**
 * Record one hit for `key` and report whether it is within `limit` per
 * `windowMs`. A fixed-window counter — simple, allocation-light, and good
 * enough for auth/abuse throttling. `now` is injectable for deterministic tests.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return {
      allowed: true,
      limit: opts.limit,
      remaining: opts.limit - 1,
      resetSeconds: Math.ceil(opts.windowMs / 1000),
      retryAfter: 0,
    };
  }
  existing.count += 1;
  const allowed = existing.count <= opts.limit;
  const resetSeconds = Math.max(0, Math.ceil((existing.resetAt - now) / 1000));
  return {
    allowed,
    limit: opts.limit,
    remaining: Math.max(0, opts.limit - existing.count),
    resetSeconds,
    retryAfter: allowed ? 0 : resetSeconds,
  };
}

/** Request budget class: reads are cheap, writes moderate, bulk import/export scarce. */
export type RouteClass = "read" | "write" | "bulk";

export function routeClass(req: Request): RouteClass {
  const { pathname } = new URL(req.url);
  if (pathname.startsWith("/api/import") || pathname.startsWith("/api/export")) return "bulk";
  return req.method === "GET" || req.method === "HEAD" ? "read" : "write";
}

/** Per-class budget, overridable via env (read at call time so tests can tune it). */
function budgetFor(cls: RouteClass): { limit: number; windowMs: number } {
  const windowMs = Number(process.env.RATELIMIT_WINDOW_MS ?? 60_000);
  const limit =
    cls === "read"
      ? Number(process.env.RATELIMIT_READ ?? 600)
      : cls === "write"
        ? Number(process.env.RATELIMIT_WRITE ?? 300)
        : Number(process.env.RATELIMIT_BULK ?? 60);
  return { limit, windowMs };
}

/**
 * Apply the whole-API rate limit for a request by an authenticated caller.
 * Keyed by caller identity + client IP + route class, so a read flood can't
 * starve writes and one tenant's key can't exhaust another's budget.
 */
export function apiRateLimit(
  req: Request,
  identity: string,
  now: number = Date.now(),
): RateLimitResult {
  const cls = routeClass(req);
  const { limit, windowMs } = budgetFor(cls);
  return rateLimit(`api:${cls}:${identity}:${clientIp(req)}`, { limit, windowMs }, now);
}

/** Best-effort client IP from proxy headers, falling back to a shared bucket. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Test/utility hook — clears all counters. */
export function __resetRateLimits(): void {
  buckets.clear();
}
