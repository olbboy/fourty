import type { NextResponse } from "next/server";
import type { AuthOk } from "@/lib/api";
import { authorizeInstanceOwner } from "@/lib/instance-owner";
import type { Action } from "@/lib/permissions";

/**
 * SSO connections are instance-wide and sign-in links existing users by email
 * (ADR-014), so whoever manages them can sign in as anyone on the instance.
 * Only admins of the instance owner's workspace — the first one created, at
 * setup — may read or change them; admins of later workspaces get 403.
 */
export async function authorizeSso(auth: AuthOk, action: Action): Promise<NextResponse | null> {
  return authorizeInstanceOwner(auth, "sso", action, {
    refusal: "Forbidden: SSO is managed from the instance owner's workspace",
  });
}
