import { and, asc, eq, isNull, isNotNull, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { taskInput } from "@/lib/validators";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
  const params = new URL(req.url).searchParams;
  const state = params.get("state"); // open | done | all
  const entityType = params.get("entityType");
  const entityId = params.get("entityId");

  const where: SQL[] = [];
  if (state === "done") where.push(isNotNull(tables.tasks.completedAt));
  else if (state !== "all") where.push(isNull(tables.tasks.completedAt));
  if (entityType) where.push(eq(tables.tasks.entityType, entityType));
  if (entityId) where.push(eq(tables.tasks.entityId, entityId));

  const rows = await db
    .select()
    .from(tables.tasks)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(tables.tasks.dueDate))
    .limit(500);
  return json({ tasks: rows });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
  const body = await parseBody(req, taskInput);
  if (!body.ok) return body.response;
  const id = newId();
  await db
    .insert(tables.tasks)
    .values({ id, ...body.data, ownerId: auth.user?.id ?? null, createdAt: Date.now() });
  const row = (await db.select().from(tables.tasks).where(eq(tables.tasks.id, id)).limit(1))[0]!;
  return json({ task: row }, { status: 201 });
  });
}
