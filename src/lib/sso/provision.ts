import { and, eq, isNull } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId, newToken } from "@/lib/id";
import { hashPassword } from "@/lib/auth";

/**
 * Just-in-time provisioning for SSO logins (Gate D4, ADR-014). Operates on the
 * global identity plane (users / workspace_members — no RLS), so it runs outside
 * a workspace transaction, exactly like createUser/createWorkspace do at setup.
 */

export type SsoConnectionRef = {
  defaultWorkspaceId: string | null;
  defaultRole: string;
};

/**
 * Find a user by verified email, or create one. SSO-only users get a random,
 * unusable password hash — they authenticate via the IdP, never a local password
 * (they can set one later through a reset). An email that already exists (a local
 * password user) is linked, not duplicated: SSO becomes an alternate login.
 */
export async function findOrProvisionUser(
  email: string,
  name?: string | null,
): Promise<{ userId: string; provisioned: boolean }> {
  const normalized = email.toLowerCase().trim();
  const existing = (
    await db.select({ id: tables.users.id }).from(tables.users).where(eq(tables.users.email, normalized)).limit(1)
  )[0];
  if (existing) return { userId: existing.id, provisioned: false };

  const userId = newId();
  await db.insert(tables.users).values({
    id: userId,
    email: normalized,
    name: name?.trim() || normalized.split("@")[0],
    passwordHash: hashPassword(newToken()), // random → cannot match any password
    role: "member",
    createdAt: Date.now(),
  });
  return { userId, provisioned: true };
}

/**
 * Ensure the user belongs to the connection's default workspace (idempotent) and
 * return the workspace to activate for the session. With no default workspace on
 * the connection, fall back to the user's first active membership (or null).
 */
export async function ensureMembershipForConnection(
  userId: string,
  connection: SsoConnectionRef,
): Promise<string | null> {
  if (connection.defaultWorkspaceId) {
    const wsId = connection.defaultWorkspaceId;
    const existing = (
      await db
        .select({ id: tables.workspaceMembers.id })
        .from(tables.workspaceMembers)
        .where(and(eq(tables.workspaceMembers.userId, userId), eq(tables.workspaceMembers.workspaceId, wsId)))
        .limit(1)
    )[0];
    if (!existing) {
      await db.insert(tables.workspaceMembers).values({
        id: newId(),
        workspaceId: wsId,
        userId,
        role: connection.defaultRole || "member",
        createdAt: Date.now(),
      });
    }
    return wsId;
  }

  const first = (
    await db
      .select({ workspaceId: tables.workspaceMembers.workspaceId })
      .from(tables.workspaceMembers)
      .where(and(eq(tables.workspaceMembers.userId, userId), isNull(tables.workspaceMembers.deactivatedAt)))
      .limit(1)
  )[0];
  return first?.workspaceId ?? null;
}

/** Enabled providers for the login screen (id + label only — no secrets). */
export async function listLoginProviders(): Promise<{ id: string; label: string }[]> {
  const rows = await db
    .select({ id: tables.ssoConnections.id, label: tables.ssoConnections.label })
    .from(tables.ssoConnections)
    .where(eq(tables.ssoConnections.enabled, 1));
  return rows;
}
