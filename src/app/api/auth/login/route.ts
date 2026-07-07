import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { json, apiError, parseBody, tooManyRequests } from "@/lib/api";
import { createSession, verifyPassword, membershipsOf } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Brute-force protection: 10 attempts per IP per 15 minutes.
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  const gate = rateLimit(`login:${clientIp(req)}`, {
    limit: LOGIN_LIMIT,
    windowMs: LOGIN_WINDOW_MS,
  });
  if (!gate.allowed) {
    return tooManyRequests("Too many login attempts. Try again later.", gate.retryAfter);
  }

  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  const user = (
    await db
      .select()
      .from(tables.users)
      .where(eq(tables.users.email, body.data.email.toLowerCase().trim()))
      .limit(1)
  )[0];
  if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
    return apiError("Invalid email or password", 401);
  }
  // Activate the user's first workspace for this session.
  const memberships = await membershipsOf(user.id);
  await createSession(user.id, memberships[0]?.workspaceId ?? null);
  return json({ ok: true });
}
