import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tables, withWorkspace } from "@/db";
import { json, apiError, parseBody } from "@/lib/api";
import { createSession, createUser, getSessionUser, roleInWorkspace, setSessionWorkspace } from "@/lib/auth";
import { inviteState, parseInviteToken } from "@/lib/invites";
import { newId } from "@/lib/id";
import { audit } from "@/lib/audit";

const schema = z.object({
  token: z.string().min(3),
  // For an invitee without an account yet: sign them up as the invite's email.
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(200).optional(),
});

/**
 * Accept a workspace invite. Special auth flow (the caller isn't a member yet):
 * the token is `${workspaceId}.${secret}`, so we resolve the workspace, enter its
 * RLS scope, and match the invite by hash. A valid, unexpired invite grants (or
 * reactivates) membership.
 *
 * The invitee joins as either:
 *   - the currently signed-in user, or
 *   - a brand-new account created from the invite's email (name + password in
 *     the body) — the token authorizes that signup.
 * If the invite's email already has an account, the holder must sign in first.
 *
 * Someone already active in the workspace cannot use the link: it would change
 * their role (an admin opening the link they made for a new hire would demote
 * themselves) and spend a link meant for someone else. A signed-in joiner's
 * session moves to the workspace they joined.
 */
export async function POST(req: Request) {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  const parsed = parseInviteToken(body.data.token);
  if (!parsed) return apiError("Invalid invite token", 400);
  const { workspaceId, tokenHash } = parsed;
  const sessionUser = await getSessionUser();

  return withWorkspace(workspaceId, async () => {
    const invite = (
      await db.select().from(tables.invites).where(eq(tables.invites.tokenHash, tokenHash)).limit(1)
    )[0];
    // A link opened again after joining is not an error to the person holding
    // it: say it was used, so the page can send them to sign in.
    const state = invite ? inviteState(invite) : "dead";
    if (state === "used") return apiError("Invite already accepted", 409);
    if (!invite || state === "dead") return apiError("Invite is invalid or expired", 400);

    // Resolve which user is joining.
    let userId: string;
    if (sessionUser) {
      userId = sessionUser.id;
      if (await roleInWorkspace(userId, workspaceId)) {
        return apiError("Already a member of this workspace", 409);
      }
    } else {
      const existing = (
        await db.select().from(tables.users).where(eq(tables.users.email, invite.email)).limit(1)
      )[0];
      if (existing) {
        return apiError("Sign in to accept this invite", 401);
      }
      if (!body.data.name || !body.data.password) {
        return apiError("name and password are required to accept as a new user", 400);
      }
      userId = await createUser(invite.email, body.data.name, body.data.password, "member");
      await createSession(userId, workspaceId);
    }

    // Add or reactivate the membership at the invite's role.
    const member = (
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
    if (member) {
      await db
        .update(tables.workspaceMembers)
        .set({ role: invite.role, deactivatedAt: null })
        .where(eq(tables.workspaceMembers.id, member.id));
    } else {
      await db.insert(tables.workspaceMembers).values({
        id: newId(),
        workspaceId,
        userId,
        role: invite.role,
        createdAt: Date.now(),
      });
    }
    await db.update(tables.invites).set({ acceptedAt: Date.now() }).where(eq(tables.invites.id, invite.id));
    await audit(userId, "member.joined", { objectType: "user", objectId: userId, meta: { role: invite.role } });
    if (sessionUser) await setSessionWorkspace(workspaceId);
    return json({ ok: true, workspaceId, role: invite.role });
  });
}
