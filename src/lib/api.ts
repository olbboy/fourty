import { NextResponse } from "next/server";
import { eq, isNull, and } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";
import { getSessionUser, sha256, type SessionUser } from "./auth";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export type AuthResult =
  | { ok: true; user: SessionUser | null; viaApiKey: boolean }
  | { ok: false; response: NextResponse };

/**
 * Authenticate a request: session cookie (app UI) or Bearer API key (public REST API).
 */
export async function authenticate(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const key = authHeader.slice(7).trim();
    const row = db
      .select()
      .from(tables.apiKeys)
      .where(and(eq(tables.apiKeys.keyHash, sha256(key)), isNull(tables.apiKeys.revokedAt)))
      .get();
    if (row) {
      db.update(tables.apiKeys)
        .set({ lastUsedAt: Date.now() })
        .where(eq(tables.apiKeys.id, row.id))
        .run();
      return { ok: true, user: null, viaApiKey: true };
    }
    return { ok: false, response: apiError("Invalid API key", 401) };
  }
  const user = await getSessionUser();
  if (user) return { ok: true, user, viaApiKey: false };
  return { ok: false, response: apiError("Unauthorized", 401) };
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
