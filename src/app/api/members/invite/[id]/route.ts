import { and, eq, isNull } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

// Take back a pending invite (admin only). Its link is refused from now on,
// like an expired one. A used or already revoked invite is not found.
export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "members", "delete");
    if (denied) return denied;
    const { id } = await params;
    const revoked = (
      await db
        .update(tables.invites)
        .set({ revokedAt: Date.now() })
        .where(and(eq(tables.invites.id, id), isNull(tables.invites.acceptedAt), isNull(tables.invites.revokedAt)))
        .returning({ email: tables.invites.email })
    )[0];
    if (!revoked) return apiError("Invite not found", 404);
    await audit(auth.user?.id, "member.invite_revoked", {
      objectType: "invite",
      objectId: id,
      meta: { email: revoked.email },
    });
    return json({ ok: true });
  });
}
