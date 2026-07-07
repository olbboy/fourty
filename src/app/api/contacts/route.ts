import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { dispatchEvent } from "@/lib/workflows/engine";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { contactInput } from "@/lib/validators";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const status = params.get("status");
  const companyId = params.get("companyId");
  const sort = params.get("sort") ?? "updatedAt";
  const limit = Math.min(Number(params.get("limit")) || 200, 500);

  const where: SQL[] = [];
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    where.push(
      or(
        ilike(sql`${tables.contacts.firstName} || ' ' || ${tables.contacts.lastName}`, pattern),
        ilike(tables.contacts.email, pattern),
        ilike(tables.contacts.jobTitle, pattern),
      )!,
    );
  }
  if (status) where.push(eq(tables.contacts.status, status));
  if (companyId) where.push(eq(tables.contacts.companyId, companyId));

  const orderCol =
    sort === "score"
      ? desc(tables.contacts.score)
      : sort === "name"
        ? tables.contacts.firstName
        : sort === "createdAt"
          ? desc(tables.contacts.createdAt)
          : desc(tables.contacts.updatedAt);

  const rows = await db
    .select()
    .from(tables.contacts)
    .where(where.length ? and(...where) : undefined)
    .orderBy(orderCol)
    .limit(limit);

  return json({ contacts: rows.map((r) => ({ ...r, custom: JSON.parse(r.custom) })) });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
  const body = await parseBody(req, contactInput);
  if (!body.ok) return body.response;

  const now = Date.now();
  const id = newId();
  const { custom, ...fields } = body.data;
  await db.insert(tables.contacts)
    .values({
      id,
      ...fields,
      ownerId: auth.user?.id ?? null,
      custom: JSON.stringify(custom ?? {}),
      createdAt: now,
      updatedAt: now,
    });

  await logActivity({ type: "created", entityType: "contact", entityId: id, actorId: auth.user?.id });
  await recomputeContactScore(id);
  const row = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0]!;
  await dispatchEvent({
    event: "contact.created",
    entityType: "contact",
    entityId: id,
    snapshot: { ...row, custom: undefined },
  });
  return json({ contact: { ...row, custom: JSON.parse(row.custom) } }, { status: 201 });
  });
}
