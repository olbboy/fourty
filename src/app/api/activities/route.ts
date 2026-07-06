import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, parseBody } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { activityLogInput } from "@/lib/validators";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const params = new URL(req.url).searchParams;
  const entityType = params.get("entityType");
  const entityId = params.get("entityId");
  const limit = Math.min(Number(params.get("limit")) || 50, 200);

  const where = [];
  if (entityType) where.push(eq(tables.activities.entityType, entityType));
  if (entityId) where.push(eq(tables.activities.entityId, entityId));

  const rows = db
    .select()
    .from(tables.activities)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(tables.activities.createdAt))
    .limit(limit)
    .all();
  return json({ activities: rows.map((r) => ({ ...r, meta: JSON.parse(r.meta) })) });
}

/** Log a manual touchpoint: email, call, or meeting. Feeds timeline + lead scoring. */
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, activityLogInput);
  if (!body.ok) return body.response;
  logActivity({
    type: body.data.type,
    entityType: body.data.entityType,
    entityId: body.data.entityId,
    actorId: auth.user?.id,
    meta: body.data.note ? { note: body.data.note } : {},
  });
  if (body.data.entityType === "contact") recomputeContactScore(body.data.entityId);
  return json({ ok: true }, { status: 201 });
}
