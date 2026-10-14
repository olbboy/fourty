import { withAuth, json, apiError } from "@/lib/api";
import { authorizeInstanceOwner } from "@/lib/instance-owner";
import { activeMemberAccount } from "@/lib/member-target";
import { endSessions } from "@/lib/my-sessions";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ userId: string }> };

/**
 * Sign a member out on every device (instance owner's admins, as a person),
 * e.g. after a lost phone. Sessions are shared by every workspace the person
 * is in, hence the same rule as the other account rescues.
 */
export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = await authorizeInstanceOwner(auth, "members", "update", { person: true });
    if (denied) return denied;
    const { userId } = await params;
    if (!(await activeMemberAccount(auth.workspaceId, userId))) return apiError("Member not found", 404);
    const ended = await endSessions(userId);
    await audit(auth.user?.id, "member.signed_out", { objectType: "user", objectId: userId, meta: { ended } });
    return json({ ended });
  });
}
