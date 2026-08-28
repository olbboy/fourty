import { z } from "zod";
import { json, apiError, parseBody, tooManyRequests } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { consumePasswordReset } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(16),
  // Same bounds as signup (PASSWORD_MIN/MAX); zod repeats them here so a bad
  // password is a 400 with a field error rather than a 500 from setPassword.
  password: z.string().min(8).max(200),
});

// Brute-forcing a 24-byte token is hopeless, but the limit keeps a script from
// hammering stolen-link guesses for free. Login's budget fits fine.
const RESET_LIMIT = 10;
const RESET_WINDOW_MS = 15 * 60 * 1000;

/** Redeem a reset token for a new password. One error message for unknown,
 *  expired, and already-used — distinguishing them only helps an attacker
 *  probing stolen links. */
export async function POST(req: Request) {
  const gate = rateLimit(`reset:${clientIp(req)}`, {
    limit: RESET_LIMIT,
    windowMs: RESET_WINDOW_MS,
  });
  if (!gate.allowed) {
    return tooManyRequests("Too many attempts. Try again later.", gate.retryAfter);
  }

  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;

  const ok = await consumePasswordReset(body.data.token, body.data.password);
  if (!ok) return apiError("This reset link is invalid or has expired", 400);
  return json({ ok: true });
}
