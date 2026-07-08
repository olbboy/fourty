import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { json, apiError, parseBody } from "@/lib/api";
import { getSessionUser, verifyPassword } from "@/lib/auth";

/**
 * Disable 2FA (Gate D2). Requires the account password (re-auth) to prevent a
 * hijacked session from silently removing the second factor. Clears the secret,
 * flag, and backup codes.
 */
const schema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  const row = (await db.select().from(tables.users).where(eq(tables.users.id, user.id)).limit(1))[0];
  if (!row) return apiError("Unauthorized", 401);
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  if (!verifyPassword(body.data.password, row.passwordHash)) return apiError("Incorrect password", 403);

  await db
    .update(tables.users)
    .set({ totpEnabled: 0, totpSecret: null, backupCodes: "[]" })
    .where(eq(tables.users.id, user.id));
  return json({ enabled: false });
}
