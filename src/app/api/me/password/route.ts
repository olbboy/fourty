import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, json, apiError, parseBody, tooManyRequests } from "@/lib/api";
import { createSession, sessionClient, setPassword, verifyPassword, PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth";
import { rateLimit, loginBudget } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

/**
 * Change your own password while signed in. It takes the current one, so a
 * session left open on someone else's screen cannot lock you out; guesses are
 * rate-limited like sign-in. Every session ends with the old password, then
 * this one starts again, so you stay signed in here and nowhere else.
 */
export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    if (!auth.user) return apiError("Sign in as a person to change your password", 403);
    const { limit, windowMs } = loginBudget();
    const gate = rateLimit(`password:${auth.user.id}`, { limit, windowMs });
    if (!gate.allowed) return tooManyRequests("Too many attempts. Try again later.", gate.retryAfter);
    const body = await parseBody(req, schema);
    if (!body.ok) return body.response;
    const user = (
      await db.select({ hash: tables.users.passwordHash }).from(tables.users).where(eq(tables.users.id, auth.user.id)).limit(1)
    )[0];
    if (!user || !verifyPassword(body.data.currentPassword, user.hash)) {
      return apiError("Current password is wrong", 400);
    }
    await setPassword(auth.user.id, body.data.newPassword);
    await createSession(auth.user.id, auth.workspaceId, sessionClient(req));
    await audit(auth.user.id, "account.password_changed", { objectType: "user", objectId: auth.user.id });
    return json({ ok: true });
  });
}
