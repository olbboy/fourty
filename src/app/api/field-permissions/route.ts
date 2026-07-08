import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { audit } from "@/lib/audit";
import { FIELD_PERM_OBJECTS } from "@/lib/field-permissions";

/**
 * Manage field-level permissions (Gate D1). Admin-only (a field-visibility rule
 * is workspace administration). Upsert one (object, field, role) rule; a rule
 * with both flags true is equivalent to no rule and is deleted.
 */
const input = z.object({
  object: z.enum(FIELD_PERM_OBJECTS),
  field: z.string().min(1).max(60),
  role: z.enum(["member", "viewer"]),
  canRead: z.boolean(),
  canWrite: z.boolean(),
});

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "field-permissions", "read");
    if (denied) return denied;
    const rows = await db.select().from(tables.fieldPermissions);
    return json({
      rules: rows.map((r) => ({
        id: r.id,
        object: r.object,
        field: r.field,
        role: r.role,
        canRead: r.canRead === 1,
        canWrite: r.canWrite === 1,
      })),
    });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "field-permissions", "create");
    if (denied) return denied;
    const body = await parseBody(req, input);
    if (!body.ok) return body.response;
    const { object, field, role, canRead, canWrite } = body.data;

    const existing = (
      await db
        .select()
        .from(tables.fieldPermissions)
        .where(
          and(
            eq(tables.fieldPermissions.object, object),
            eq(tables.fieldPermissions.field, field),
            eq(tables.fieldPermissions.role, role),
          ),
        )
        .limit(1)
    )[0];

    // A fully-permissive rule is the default — store nothing (delete any existing).
    if (canRead && canWrite) {
      if (existing) await db.delete(tables.fieldPermissions).where(eq(tables.fieldPermissions.id, existing.id));
      await audit(auth.user?.id, "field_permission.cleared", { objectType: "field_permission", meta: { object, field, role } });
      return json({ ok: true, cleared: true });
    }

    if (existing) {
      await db
        .update(tables.fieldPermissions)
        .set({ canRead: canRead ? 1 : 0, canWrite: canWrite ? 1 : 0 })
        .where(eq(tables.fieldPermissions.id, existing.id));
    } else {
      await db.insert(tables.fieldPermissions).values({
        id: newId(),
        object,
        field,
        role,
        canRead: canRead ? 1 : 0,
        canWrite: canWrite ? 1 : 0,
        createdAt: Date.now(),
      });
    }
    await audit(auth.user?.id, "field_permission.set", { objectType: "field_permission", meta: { object, field, role, canRead, canWrite } });
    return json({ ok: true });
  });
}
