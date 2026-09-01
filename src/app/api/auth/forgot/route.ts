import { z } from "zod";
import { json, parseBody, requestOrigin, tooManyRequests } from "@/lib/api";
import { rateLimit, clientIp, forgotBudget } from "@/lib/ratelimit";
import { requestPasswordReset } from "@/lib/password-reset";

const schema = z.object({ email: z.string().email() });

/**
 * Request a password-reset email. Answers 200 with the same body whether or
 * not the address has an account — anything else turns the endpoint into an
 * oracle for which emails are registered. The real outcome (mail queued, or
 * nothing) is decided inside requestPasswordReset.
 */
export async function POST(req: Request) {
  const { limit, windowMs } = forgotBudget();
  const gate = rateLimit(`forgot:${clientIp(req)}`, { limit, windowMs });
  if (!gate.allowed) {
    return tooManyRequests("Too many reset requests. Try again later.", gate.retryAfter);
  }

  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;

  await requestPasswordReset(body.data.email, requestOrigin(req));
  return json({ ok: true });
}
