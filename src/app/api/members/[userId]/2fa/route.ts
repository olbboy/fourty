import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, json, apiError } from "@/lib/api";
import { authorizeInstanceOwner } from "@/lib/instance-owner";
import { activeMemberAccount } from "@/lib/member-target";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ userId: string }> };

/**
 * Turn off a member's two-factor sign-in, for someone who lost both their
 * phone and their backup codes (instance owner's admins, as a person). They
 * sign in with their password and can set 2FA up again.
 */
export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = await authorizeInstanceOwner(auth, "members", "update", { person: true });
    if (denied) return denied;
    const { userId } = await params;
    if (!(await activeMemberAccount(auth.workspaceId, userId))) return apiError("Member not found", 404);
    await db
      .update(tables.users)
      .set({ totpEnabled: 0, totpSecret: null, backupCodes: "[]" })
      .where(eq(tables.users.id, userId));
    await audit(auth.user?.id, "member.2fa_disabled", { objectType: "user", objectId: userId });
    return json({ ok: true });
  });
}
