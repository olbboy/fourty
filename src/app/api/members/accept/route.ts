import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db, tables, withWorkspace } from "@/db";
import { json, apiError, parseBody } from "@/lib/api";
import { createSession, createUser, getSessionUser, sha256 } from "@/lib/auth";
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
 */
export async function POST(req: Request) {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  const token = body.data.token;
  const dot = token.indexOf(".");
  if (dot <= 0) return apiError("Invalid invite token", 400);
  const workspaceId = token.slice(0, dot);
  const tokenHash = sha256(token);
  const sessionUser = await getSessionUser();

  return withWorkspace(workspaceId, async () => {
    const invite = (
      await db
        .select()
        .from(tables.invites)
        .where(and(eq(tables.invites.tokenHash, tokenHash), isNull(tables.invites.acceptedAt)))
        .limit(1)
    )[0];
    if (!invite || invite.expiresAt < Date.now()) {
      return apiError("Invite is invalid or expired", 400);
    }

    // Resolve which user is joining.
    let userId: string;
    if (sessionUser) {
      userId = sessionUser.id;
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
    return json({ ok: true, workspaceId, role: invite.role });
  });
}
