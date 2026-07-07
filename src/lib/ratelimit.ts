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
  remaining: number;
  /** Seconds until the window resets (for a `Retry-After` header). */
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
    return { allowed: true, remaining: opts.limit - 1, retryAfter: 0 };
  }
  existing.count += 1;
  const allowed = existing.count <= opts.limit;
  return {
    allowed,
    remaining: Math.max(0, opts.limit - existing.count),
    retryAfter: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
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
