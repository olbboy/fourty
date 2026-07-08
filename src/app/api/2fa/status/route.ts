import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { json, apiError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

/** Report the caller's 2FA state (Gate D2): enabled, or set up but not yet enabled. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("Unauthorized", 401);
  const row = (await db.select().from(tables.users).where(eq(tables.users.id, user.id)).limit(1))[0];
  if (!row) return apiError("Unauthorized", 401);
  return json({ enabled: row.totpEnabled === 1, pending: row.totpEnabled === 0 && !!row.totpSecret });
}
