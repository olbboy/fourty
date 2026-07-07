import { NextResponse } from "next/server";
import { eq, isNull, and } from "drizzle-orm";
import { z } from "zod";
import { db, tables, withWorkspace } from "@/db";
import { getSessionUser, roleInWorkspace, sha256, type SessionUser } from "./auth";
import { can, type Action } from "./permissions";

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
      return { ok: true, user: null, workspaceId: row.workspaceId, role: row.role, viaApiKey: true };
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
  return { ok: true, user, workspaceId: user.workspaceId, role, viaApiKey: false };
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

/**
 * Authenticate, then run `handler` inside the request's workspace transaction so
 * every `db` query is RLS-scoped to that workspace. Wrap every data route in
 * this. `SET LOCAL app.workspace_id` is issued once for the whole handler.
 */
export async function withAuth(
  req: Request,
  handler: (auth: AuthOk) => Promise<Response> | Response,
): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  return withWorkspace(auth.workspaceId, async () => handler(auth));
}

/** Parse + validate a JSON body against a zod schema, returning a typed result or a 400. */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
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
  return { ok: true, data: parsed.data };
}
