import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json } from "@/lib/api";
import { isInstanceOwnerWorkspace } from "@/lib/instance-owner";

// List the workspace's members (admin only — see permission matrix). Joins the
// membership rows (workspace-scoped) to the global users table for name/email.
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "members", "read");
    if (denied) return denied;
    const rows = await db
      .select({
        userId: tables.workspaceMembers.userId,
        role: tables.workspaceMembers.role,
        deactivatedAt: tables.workspaceMembers.deactivatedAt,
        createdAt: tables.workspaceMembers.createdAt,
        email: tables.users.email,
        name: tables.users.name,
        totpEnabled: tables.users.totpEnabled,
      })
      .from(tables.workspaceMembers)
      .innerJoin(tables.users, eq(tables.users.id, tables.workspaceMembers.userId))
      .where(eq(tables.workspaceMembers.workspaceId, auth.workspaceId));
    // canRescue: this caller may change a member's email, reset link and 2FA.
    const canRescue = !auth.viaApiKey && (await isInstanceOwnerWorkspace(auth.workspaceId));
    return json({
      members: rows.map(({ totpEnabled, ...m }) => ({ ...m, twoFactor: totpEnabled === 1 })),
      canRescue,
    });
  });
}
