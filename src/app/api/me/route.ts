import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({ name: z.string().trim().min(1).max(120) });

/** Rename yourself: the name every list, owner picker and timeline shows. */
export async function PATCH(req: Request) {
  return withAuth(req, async (auth) => {
    if (!auth.user) return apiError("Sign in as a person to change your name", 403);
    const body = await parseBody(req, schema);
    if (!body.ok) return body.response;
    await db.update(tables.users).set({ name: body.data.name }).where(eq(tables.users.id, auth.user.id));
    await audit(auth.user.id, "account.renamed", { objectType: "user", objectId: auth.user.id });
    return json({ name: body.data.name });
  });
}
