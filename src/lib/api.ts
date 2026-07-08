import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { z } from "zod";
import { db, tables, withWorkspace, withContext } from "@/db";
import { getSessionUser, roleInWorkspace, sha256, type SessionUser } from "./auth";
import { can, type Action } from "./permissions";
import { apiRateLimit, type RateLimitResult } from "./ratelimit";
import { recordHttp, normalizeRoute } from "./metrics";
import { log } from "./logger";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** 429 with a Retry-After header (seconds). */
export function tooManyRequests(message: string, retryAfter: number) {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export type AuthOk = {
  ok: true;
  user: SessionUser | null;
  /** The workspace this request acts within (from the API key or session). */
  workspaceId: string;
  /** The caller's role IN that workspace (RBAC — admin | member | viewer). */
  role: string;
  /** Stable per-caller id (API-key id or user id) for rate-limit bucketing. */
  callerId: string;
  viaApiKey: boolean;
};
export type AuthResult = AuthOk | { ok: false; response: NextResponse };

/**
 * Authenticate a request: session cookie (app UI) or Bearer API key (public REST
 * API). Both resolve the request's workspace — an API key belongs to exactly one
 * workspace; a session carries its active workspace. That workspace is the only
 * one the request can ever touch (enforced by RLS via withAuth/withWorkspace).
 */
export async function authenticate(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const key = authHeader.slice(7).trim();
    const row = (
      await db
        .select()
        .from(tables.apiKeys)
        .where(and(eq(tables.apiKeys.keyHash, sha256(key)), isNull(tables.apiKeys.revokedAt)))
        .limit(1)
    )[0];
    if (row) {
      await db
        .update(tables.apiKeys)
        .set({ lastUsedAt: Date.now() })
        .where(eq(tables.apiKeys.id, row.id));
      return {
        ok: true,
        user: null,
        workspaceId: row.workspaceId,
        role: row.role,
        callerId: row.id,
        viaApiKey: true,
      };
    }
    return { ok: false, response: apiError("Invalid API key", 401) };
  }
  const user = await getSessionUser();
  if (!user) return { ok: false, response: apiError("Unauthorized", 401) };
  if (!user.workspaceId) return { ok: false, response: apiError("No active workspace", 401) };
  // The caller's role in the active workspace. `null` = not an active member
  // (removed or deactivated) → the session may no longer act there.
  const role = await roleInWorkspace(user.id, user.workspaceId);
  if (!role) return { ok: false, response: apiError("Not a member of this workspace", 403) };
  return {
    ok: true,
    user,
    workspaceId: user.workspaceId,
    role,
    callerId: user.id,
    viaApiKey: false,
  };
}

/**
 * RBAC gate. Call at the top of a handler (inside withAuth) for the object +
 * action it performs. Returns a 403 response when denied, or `null` when
 * allowed — `const denied = authorize(auth, "contacts", "create"); if (denied)
 * return denied;`. Every mutating handler MUST call this (enforced by
 * tests/api-auth.test.ts's static guard).
 */
export function authorize(auth: AuthOk, object: string, action: Action): NextResponse | null {
  return can(auth.role, object, action)
    ? null
    : apiError(`Forbidden: ${auth.role} cannot ${action} ${object}`, 403);
}

/** Attach standard RateLimit-* headers (and Retry-After on 429) to a response. */
function setRateLimitHeaders(res: Response, rl: RateLimitResult): void {
  res.headers.set("RateLimit-Limit", String(rl.limit));
  res.headers.set("RateLimit-Remaining", String(rl.remaining));
  res.headers.set("RateLimit-Reset", String(rl.resetSeconds));
  if (!rl.allowed) res.headers.set("Retry-After", String(rl.retryAfter));
}

/**
 * Authenticate, then run `handler` inside the request's workspace transaction so
 * every `db` query is RLS-scoped to that workspace. Wrap every data route in
 * this. `SET LOCAL app.workspace_id` is issued once for the whole handler.
 *
 * Also the cross-cutting seam for Gate B4: assigns a request_id, enforces the
 * whole-API rate limit (per caller + IP + route class, with RateLimit-* headers),
 * and records latency/status metrics + a structured access log for every request.
 */
export async function withAuth(
  req: Request,
  handler: (auth: AuthOk) => Promise<Response> | Response,
): Promise<Response> {
  const startedAt = performance.now();
  const requestId = randomUUID();
  const route = normalizeRoute(new URL(req.url).pathname);

  const finish = (res: Response, workspaceId?: string): Response => {
    const durationMs = performance.now() - startedAt;
    recordHttp(route, req.method, res.status, durationMs / 1000);
    log({ request_id: requestId, workspace_id: workspaceId }).info(
      { route, method: req.method, status: res.status, duration_ms: Math.round(durationMs) },
      "request",
    );
    return res;
  };

  const auth = await authenticate(req);
  if (!auth.ok) return finish(auth.response);

  // Whole-API rate limit, keyed by caller identity + IP + route class.
  const rl = apiRateLimit(req, `${auth.viaApiKey ? "key" : "user"}:${auth.callerId}`);
  if (!rl.allowed) {
    const res = tooManyRequests("Rate limit exceeded", rl.retryAfter);
    setRateLimitHeaders(res, rl);
    return finish(res, auth.workspaceId);
  }

  const response = await withContext({ requestId, workspaceId: auth.workspaceId }, () =>
    withWorkspace(auth.workspaceId, async () => handler(auth)),
  );
  setRateLimitHeaders(response, rl);
  return finish(response, auth.workspaceId);
}

/**
 * Parse + validate a JSON body against a zod schema, returning a typed result or a
 * 400. `keys` are the caller's actual top-level keys (before zod defaults) — used
 * by field-level permission checks so a defaulted field isn't mistaken for one the
 * caller tried to write.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T>; keys: string[] } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: apiError("Invalid JSON body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      response: apiError(`${issue.path.join(".") || "body"}: ${issue.message}`),
    };
  }
  const keys = raw && typeof raw === "object" ? Object.keys(raw as Record<string, unknown>) : [];
  return { ok: true, data: parsed.data, keys };
}
