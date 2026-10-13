import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, json, apiError, parseBody } from "@/lib/api";
import { authorizeInstanceOwner } from "@/lib/instance-owner";
import { activeMemberAccount } from "@/lib/member-target";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ userId: string }> };
const schema = z.object({ email: z.string().email() });

/** Change the email a member signs in with (instance owner's admins, as a person). */
export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = await authorizeInstanceOwner(auth, "members", "update", { person: true });
    if (denied) return denied;
    const { userId } = await params;
    const account = await activeMemberAccount(auth.workspaceId, userId);
    if (!account) return apiError("Member not found", 404);
    const body = await parseBody(req, schema);
    if (!body.ok) return body.response;
    const email = body.data.email.toLowerCase().trim();
    if (email === account.email) return json({ email });
    const taken = (await db.select({ id: tables.users.id }).from(tables.users).where(eq(tables.users.email, email)).limit(1))[0];
    if (taken) return apiError("Email already in use", 409);
    await db.update(tables.users).set({ email }).where(eq(tables.users.id, userId));
    await audit(auth.user?.id, "member.email_changed", {
      objectType: "user",
      objectId: userId,
      meta: { from: account.email, to: email },
    });
    return json({ email });
  });
}
