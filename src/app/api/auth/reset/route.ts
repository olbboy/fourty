import { z } from "zod";
import { json, apiError, parseBody, tooManyRequests } from "@/lib/api";
import { rateLimit, clientIp, resetBudget } from "@/lib/ratelimit";
import { consumePasswordReset } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(16),
  // Same bounds as signup (PASSWORD_MIN/MAX); zod repeats them here so a bad
  // password is a 400 with a field error rather than a 500 from setPassword.
  password: z.string().min(8).max(200),
});

/** Redeem a reset token for a new password. One error message for unknown,
 *  expired, and already-used — distinguishing them only helps an attacker
 *  probing stolen links. */
export async function POST(req: Request) {
  const { limit, windowMs } = resetBudget();
  const gate = rateLimit(`reset:${clientIp(req)}`, { limit, windowMs });
  if (!gate.allowed) {
    return tooManyRequests("Too many attempts. Try again later.", gate.retryAfter);
  }

  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;

  const ok = await consumePasswordReset(body.data.token, body.data.password);
  if (!ok) return apiError("This reset link is invalid or has expired", 400);
  return json({ ok: true });
}
