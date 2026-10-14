import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { disconnectSyncAccount } from "@/lib/sync/disconnect";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ userId: string }> };
/** A new role for an active member, or `reactivate` for a removed one (D19). */
const patchSchema = z.union([z.object({ role: z.enum(["admin", "member", "viewer"]) }), z.object({ reactivate: z.literal(true) })]);

/** Number of active admins in a workspace — used to protect the last admin. */
async function activeAdminCount(workspaceId: string): Promise<number> {
  const rows = await db
    .select({ id: tables.workspaceMembers.id })
    .from(tables.workspaceMembers)
    .where(
      and(
        eq(tables.workspaceMembers.workspaceId, workspaceId),
        eq(tables.workspaceMembers.role, "admin"),
        isNull(tables.workspaceMembers.deactivatedAt),
      ),
    );
  return rows.length;
}

async function activeMember(workspaceId: string, userId: string) {
  return (
    await db
      .select()
      .from(tables.workspaceMembers)
      .where(
        and(
          eq(tables.workspaceMembers.workspaceId, workspaceId),
          eq(tables.workspaceMembers.userId, userId),
        ),
      )
      .limit(1)
  )[0];
}

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "members", "update");
    if (denied) return denied;
    const { userId } = await params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;

    const member = await activeMember(auth.workspaceId, userId);
    if ("reactivate" in body.data) {
      // Back in one step, with the role they had; their sessions start afresh.
      if (!member) return apiError("Member not found", 404);
      if (!member.deactivatedAt) return apiError("This member is active", 400);
      await db.update(tables.workspaceMembers).set({ deactivatedAt: null }).where(eq(tables.workspaceMembers.id, member.id));
      await audit(auth.user?.id, "member.reactivated", { objectType: "user", objectId: userId, meta: { role: member.role } });
      return json({ ok: true });
    }
    if (!member || member.deactivatedAt) return apiError("Member not found", 404);
    // Never leave a workspace without an admin.
    if (
      member.role === "admin" &&
      body.data.role !== "admin" &&
      (await activeAdminCount(auth.workspaceId)) <= 1
    ) {
      return apiError("Cannot demote the last admin", 400);
    }
    await db
      .update(tables.workspaceMembers)
      .set({ role: body.data.role })
      .where(eq(tables.workspaceMembers.id, member.id));
    await audit(auth.user?.id, "member.role_changed", {
      objectType: "user",
      objectId: userId,
      meta: { from: member.role, to: body.data.role },
    });
    return json({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "members", "delete");
    if (denied) return denied;
    const { userId } = await params;

    const member = await activeMember(auth.workspaceId, userId);
    if (!member || member.deactivatedAt) return apiError("Member not found", 404);
    if (member.role === "admin" && (await activeAdminCount(auth.workspaceId)) <= 1) {
      return apiError("Cannot remove the last admin", 400);
    }
    await db
      .update(tables.workspaceMembers)
      .set({ deactivatedAt: Date.now() })
      .where(eq(tables.workspaceMembers.id, member.id));

    // ?revokeAccess=1: take back what they set up here, in the same step (D2).
    let revokedKeys = 0;
    let disconnectedMailboxes = 0;
    if (new URL(req.url).searchParams.get("revokeAccess") === "1") {
      const keys = await db
        .update(tables.apiKeys)
        .set({ revokedAt: Date.now() })
        .where(
          and(
            eq(tables.apiKeys.workspaceId, auth.workspaceId),
            eq(tables.apiKeys.createdBy, userId),
            isNull(tables.apiKeys.revokedAt),
          ),
        )
        .returning({ id: tables.apiKeys.id });
      revokedKeys = keys.length;
      const mailboxes = await db
        .select({ id: tables.syncAccounts.id })
        .from(tables.syncAccounts)
        .where(eq(tables.syncAccounts.createdBy, userId));
      for (const box of mailboxes) await disconnectSyncAccount(box.id);
      disconnectedMailboxes = mailboxes.length;
    }
    await audit(auth.user?.id, "member.removed", {
      objectType: "user",
      objectId: userId,
      meta: { revokedKeys, disconnectedMailboxes },
    });
    return json({ ok: true, revokedKeys, disconnectedMailboxes });
  });
}
