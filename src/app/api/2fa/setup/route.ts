import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { json, apiError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { generateSecret, otpauthUri } from "@/lib/totp";

/**
 * Begin 2FA enrollment (Gate D2). Generates a Base32 secret, stores it as pending
 * (totp_enabled stays 0), and returns it + an otpauth:// URI for the QR code. 2FA
 * is not active until POST /api/2fa/enable verifies the first code. Acts on the
 * caller's own account — no tenant data / RBAC object (exempt from authorize()).
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  const row = (await db.select().from(tables.users).where(eq(tables.users.id, user.id)).limit(1))[0];
  if (!row) return apiError("Unauthorized", 401);
  if (row.totpEnabled === 1) return apiError("2FA is already enabled", 400);

  const secret = generateSecret();
  await db.update(tables.users).set({ totpSecret: secret }).where(eq(tables.users.id, user.id));
  return json({ secret, otpauthUri: otpauthUri(secret, row.email) });
}
