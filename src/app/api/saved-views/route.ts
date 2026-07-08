import { z } from "zod";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { audit } from "@/lib/audit";

/**
 * Saved views (Gate C3): named filter/sort/column presets per entity. A view is
 * either personal (user_id set — visible only to its owner) or shared (user_id
 * null — visible to the whole workspace). All rows are workspace-scoped + RLS.
 */
const ENTITIES = ["contacts", "companies", "deals", "tasks"] as const;

const input = z.object({
  entity: z.enum(ENTITIES),
  name: z.string().min(1).max(80),
  config: z
    .object({
      filters: z.record(z.string(), z.unknown()).optional(),
      sort: z.string().max(60).optional(),
      columns: z.array(z.string().max(60)).max(40).optional(),
    })
    .default({}),
  shared: z.boolean().optional().default(false),
});

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const entity = new URL(req.url).searchParams.get("entity");
    const userId = auth.user?.id ?? null;
    // Visible = shared (user_id IS NULL) OR mine (user_id = me).
    const visibility = userId
      ? or(isNull(tables.savedViews.userId), eq(tables.savedViews.userId, userId))!
      : isNull(tables.savedViews.userId);
    const where = entity ? and(eq(tables.savedViews.entity, entity), visibility)! : visibility;
    const rows = await db
      .select()
      .from(tables.savedViews)
      .where(where)
      .orderBy(asc(tables.savedViews.name));
    return json({
      views: rows.map((r) => ({ ...r, config: JSON.parse(r.config), shared: r.userId === null })),
    });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "saved-views", "create");
    if (denied) return denied;
    const body = await parseBody(req, input);
    if (!body.ok) return body.response;
    const id = newId();
    // Personal unless explicitly shared (API-key callers have no user → always shared).
    const userId = body.data.shared ? null : auth.user?.id ?? null;
    await db.insert(tables.savedViews).values({
      id,
      entity: body.data.entity,
      name: body.data.name,
      config: JSON.stringify(body.data.config),
      userId,
      createdAt: Date.now(),
    });
    await audit(auth.user?.id, "saved_view.created", { objectType: "saved_view", objectId: id });
    const row = (await db.select().from(tables.savedViews).where(eq(tables.savedViews.id, id)).limit(1))[0]!;
    return json({ view: { ...row, config: JSON.parse(row.config), shared: row.userId === null } }, { status: 201 });
  });
}
