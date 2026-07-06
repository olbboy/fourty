import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { dispatchEvent } from "@/lib/workflows/engine";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { contactInput } from "@/lib/validators";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
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
        like(sql`${tables.contacts.firstName} || ' ' || ${tables.contacts.lastName}`, pattern),
        like(tables.contacts.email, pattern),
        like(tables.contacts.jobTitle, pattern),
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

  const rows = db
    .select()
    .from(tables.contacts)
    .where(where.length ? and(...where) : undefined)
    .orderBy(orderCol)
    .limit(limit)
    .all();

  return json({ contacts: rows.map((r) => ({ ...r, custom: JSON.parse(r.custom) })) });
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, contactInput);
  if (!body.ok) return body.response;

  const now = Date.now();
  const id = newId();
  const { custom, ...fields } = body.data;
  db.insert(tables.contacts)
    .values({
      id,
      ...fields,
      ownerId: auth.user?.id ?? null,
      custom: JSON.stringify(custom ?? {}),
      createdAt: now,
      updatedAt: now,
    })
    .run();

  logActivity({ type: "created", entityType: "contact", entityId: id, actorId: auth.user?.id });
  recomputeContactScore(id);
  const row = db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).get()!;
  dispatchEvent({
    event: "contact.created",
    entityType: "contact",
    entityId: id,
    snapshot: { ...row, custom: undefined },
  });
  return json({ contact: { ...row, custom: JSON.parse(row.custom) } }, { status: 201 });
}
