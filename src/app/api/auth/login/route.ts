import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { json, apiError, parseBody } from "@/lib/api";
import { createSession, verifyPassword } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, body.data.email.toLowerCase().trim()))
    .get();
  if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
    return apiError("Invalid email or password", 401);
  }
  await createSession(user.id);
  return json({ ok: true });
}
