import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().max(120).nullable().optional(),
    phone: z.string().trim().max(60).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "nothing to change");

/** The name, job title and phone of one account. */
async function ownAccount(userId: string) {
  return (await db.select({ name: tables.users.name, title: tables.users.title, phone: tables.users.phone }).from(tables.users).where(eq(tables.users.id, userId)).limit(1))[0];
}

/**
 * Your own account: the name every list, owner picker and timeline shows, and
 * the job title and phone the member list shows (D19).
 */
export async function PATCH(req: Request) {
  return withAuth(req, async (auth) => {
    if (!auth.user) return apiError("Sign in as a person to change your name", 403);
    const body = await parseBody(req, schema);
    if (!body.ok) return body.response;
    const { name, title, phone } = body.data;
    const patch = {
      ...(name !== undefined ? { name } : {}),
      ...(title !== undefined ? { title: title || null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
    };
    await db.update(tables.users).set(patch).where(eq(tables.users.id, auth.user.id));
    if (name !== undefined) await audit(auth.user.id, "account.renamed", { objectType: "user", objectId: auth.user.id });
    if (title !== undefined || phone !== undefined) await audit(auth.user.id, "account.details_changed", { objectType: "user", objectId: auth.user.id });
    const row = (await ownAccount(auth.user.id))!;
    return json(row);
  });
}

/** Your own name, job title and phone, for My account. */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    if (!auth.user) return apiError("Sign in as a person to see your account", 403);
    const row = await ownAccount(auth.user.id);
    return json(row ?? { name: auth.user.name, title: null, phone: null });
  });
}
