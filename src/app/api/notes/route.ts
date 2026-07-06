import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { noteInput } from "@/lib/validators";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const params = new URL(req.url).searchParams;
  const entityType = params.get("entityType");
  const entityId = params.get("entityId");
  if (!entityType || !entityId) return json({ notes: [] });
  const rows = db
    .select()
    .from(tables.notes)
    .where(and(eq(tables.notes.entityType, entityType), eq(tables.notes.entityId, entityId)))
    .orderBy(desc(tables.notes.createdAt))
    .all();
  return json({ notes: rows });
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, noteInput);
  if (!body.ok) return body.response;
  const id = newId();
  db.insert(tables.notes)
    .values({ id, ...body.data, authorId: auth.user?.id ?? null, createdAt: Date.now() })
    .run();
  logActivity({
    type: "note_added",
    entityType: body.data.entityType,
    entityId: body.data.entityId,
    actorId: auth.user?.id,
    meta: { preview: body.data.body.slice(0, 120) },
  });
  if (body.data.entityType === "contact") recomputeContactScore(body.data.entityId);
  const row = db.select().from(tables.notes).where(eq(tables.notes.id, id)).get()!;
  return json({ note: row }, { status: 201 });
}
