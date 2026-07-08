import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { json, apiError, parseBody, tooManyRequests } from "@/lib/api";
import { createSession, verifyPassword, membershipsOf, sha256 } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { verifyTotp } from "@/lib/totp";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Second factor, only required when the account has 2FA enabled: a 6-digit
  // TOTP code or a one-time backup code.
  token: z.string().min(6).max(20).optional(),
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

  // Second factor (Gate D2): when enabled, a valid TOTP or a one-time backup code
  // is required before a session is created.
  if (user.totpEnabled === 1 && user.totpSecret) {
    const token = body.data.token?.trim();
    if (!token) {
      return json({ error: "Two-factor code required", requires2fa: true }, { status: 401 });
    }
    const totpOk = verifyTotp(user.totpSecret, token);
    let backupOk = false;
    if (!totpOk) {
      const codes = JSON.parse(user.backupCodes) as string[];
      const hash = sha256(token);
      const idx = codes.indexOf(hash);
      if (idx !== -1) {
        backupOk = true;
        codes.splice(idx, 1); // consume the code
        await db.update(tables.users).set({ backupCodes: JSON.stringify(codes) }).where(eq(tables.users.id, user.id));
      }
    }
    if (!totpOk && !backupOk) return apiError("Invalid two-factor code", 401);
  }

  // Activate the user's first workspace for this session.
  const memberships = await membershipsOf(user.id);
  await createSession(user.id, memberships[0]?.workspaceId ?? null);
  return json({ ok: true });
}
