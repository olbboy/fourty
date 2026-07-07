import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { audit } from "@/lib/audit";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { noteInput } from "@/lib/validators";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
  const params = new URL(req.url).searchParams;
  const entityType = params.get("entityType");
  const entityId = params.get("entityId");
  if (!entityType || !entityId) return json({ notes: [] });
  const rows = await db
    .select()
    .from(tables.notes)
    .where(and(eq(tables.notes.entityType, entityType), eq(tables.notes.entityId, entityId)))
    .orderBy(desc(tables.notes.createdAt));
  return json({ notes: rows });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
  const denied = authorize(auth, "notes", "create");
  if (denied) return denied;
  const body = await parseBody(req, noteInput);
  if (!body.ok) return body.response;
  const id = newId();
  await db
    .insert(tables.notes)
    .values({ id, ...body.data, authorId: auth.user?.id ?? null, createdAt: Date.now() });
  await logActivity({
    type: "note_added",
    entityType: body.data.entityType,
    entityId: body.data.entityId,
    actorId: auth.user?.id,
    meta: { preview: body.data.body.slice(0, 120) },
  });
  if (body.data.entityType === "contact") await recomputeContactScore(body.data.entityId);
  await audit(auth.user?.id, "note.created", { objectType: "note", objectId: id });
  const row = (await db.select().from(tables.notes).where(eq(tables.notes.id, id)).limit(1))[0]!;
  return json({ note: row }, { status: 201 });
  });
}
