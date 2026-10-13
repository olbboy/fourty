import { asc } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { db, tables } from "@/db";
import { apiError, authorize, type AuthOk } from "@/lib/api";
import type { Action } from "@/lib/permissions";

/** The instance owner's workspace: the first one created, at setup (ADR-014). */
export async function isInstanceOwnerWorkspace(workspaceId: string): Promise<boolean> {
  const owner = (
    await db
      .select({ id: tables.workspaces.id })
      .from(tables.workspaces)
      .orderBy(asc(tables.workspaces.createdAt), asc(tables.workspaces.id))
      .limit(1)
  )[0];
  return owner?.id === workspaceId;
}

/**
 * authorize(), then the instance-owner check for what reaches past one
 * workspace: SSO connections, and an Account's email, password and 2FA, which
 * every workspace the person is in shares. Only admins of the instance owner's
 * workspace may (Q77). With `person`, an API key is refused too: a leaked key
 * must not be enough to take over someone's account.
 */
export async function authorizeInstanceOwner(
  auth: AuthOk,
  object: string,
  action: Action,
  opts: { person?: boolean; refusal?: string } = {},
): Promise<NextResponse | null> {
  const denied = authorize(auth, object, action);
  if (denied) return denied;
  if (opts.person && auth.viaApiKey) return apiError("Forbidden: sign in as a person to do this", 403);
  return (await isInstanceOwnerWorkspace(auth.workspaceId))
    ? null
    : apiError(opts.refusal ?? "Forbidden: only the instance owner's workspace may do this", 403);
}
