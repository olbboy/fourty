import { withAuth, json, apiError, requestOrigin } from "@/lib/api";
import { authorizeInstanceOwner } from "@/lib/instance-owner";
import { activeMemberAccount } from "@/lib/member-target";
import { ADMIN_RESET_TTL_MS, issueResetToken, resetUrl } from "@/lib/password-reset";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ userId: string }> };

/**
 * Make a one-time password reset link for a member, for the admin to hand
 * over when mail cannot (instance owner's admins, as a person). It replaces
 * any unused link the member had; the link itself is never stored or logged.
 */
export async function POST(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = await authorizeInstanceOwner(auth, "members", "update", { person: true });
    if (denied) return denied;
    const { userId } = await params;
    if (!(await activeMemberAccount(auth.workspaceId, userId))) return apiError("Member not found", 404);
    const { token, expiresAt } = await issueResetToken(userId, ADMIN_RESET_TTL_MS);
    await audit(auth.user?.id, "member.reset_link_created", { objectType: "user", objectId: userId, meta: { expiresAt } });
    return json({ url: resetUrl(requestOrigin(req), token), expiresAt }, { status: 201 });
  });
}
