import { asc } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { db, tables } from "@/db";
import { apiError, authorize, type AuthOk } from "@/lib/api";
import type { Action } from "@/lib/permissions";

/**
 * SSO connections are instance-wide and sign-in links existing users by email
 * (ADR-014), so whoever manages them can sign in as anyone on the instance.
 * Only admins of the instance owner's workspace — the first one created, at
 * setup — may read or change them; admins of later workspaces get 403.
 */
export async function authorizeSso(auth: AuthOk, action: Action): Promise<NextResponse | null> {
  const denied = authorize(auth, "sso", action);
  if (denied) return denied;
  const owner = (
    await db
      .select({ id: tables.workspaces.id })
      .from(tables.workspaces)
      .orderBy(asc(tables.workspaces.createdAt), asc(tables.workspaces.id))
      .limit(1)
  )[0];
  return owner?.id === auth.workspaceId
    ? null
    : apiError("Forbidden: SSO is managed from the instance owner's workspace", 403);
}
