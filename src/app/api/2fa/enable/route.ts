import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { json, apiError, parseBody } from "@/lib/api";
import { getSessionUser, sha256 } from "@/lib/auth";
import { verifyTotp, generateBackupCodes } from "@/lib/totp";

/**
 * Finish 2FA enrollment (Gate D2): verify the first code against the pending
 * secret, flip totp_enabled on, and return one-time backup codes (shown once,
 * stored only as sha256 hashes). Acts on the caller's own account.
 */
const schema = z.object({ token: z.string().min(6).max(10) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  const row = (await db.select().from(tables.users).where(eq(tables.users.id, user.id)).limit(1))[0];
  if (!row) return apiError("Unauthorized", 401);
  if (row.totpEnabled === 1) return apiError("2FA is already enabled", 400);
  if (!row.totpSecret) return apiError("Start setup first (POST /api/2fa/setup)", 400);

  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  if (!verifyTotp(row.totpSecret, body.data.token)) return apiError("Invalid code", 400);

  const backupCodes = generateBackupCodes();
  await db
    .update(tables.users)
    .set({ totpEnabled: 1, backupCodes: JSON.stringify(backupCodes.map((c) => sha256(c))) })
    .where(eq(tables.users.id, user.id));
  // Plaintext codes are returned exactly once — the server keeps only the hashes.
  return json({ enabled: true, backupCodes });
}
