import { rateLimit, type RateLimitResult } from "@/lib/ratelimit";

/**
 * Per-user AI turn budget (RT-E). The whole-API rate limit is sized for cheap
 * CRUD; an LLM turn is far more expensive, so chat gets its own stricter,
 * per-user cap that applies to EVERY role (a viewer can still invoke read tools).
 * In-process like the rest of the limiter — see src/lib/ratelimit.ts on the
 * single-instance trade-off. Default 60 turns/user/hour, admin-overridable.
 */
export function aiTurnQuota(identity: string, now: number = Date.now()): RateLimitResult {
  const limit = Number(process.env.AI_RATELIMIT_PER_HOUR ?? 60);
  return rateLimit(`ai:turn:${identity}`, { limit, windowMs: 3_600_000 }, now);
}
