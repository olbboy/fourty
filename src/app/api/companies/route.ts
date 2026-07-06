import { and, desc, eq, like, or, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { dispatchEvent } from "@/lib/workflows/engine";
import { companyInput } from "@/lib/validators";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const industry = params.get("industry");
  const limit = Math.min(Number(params.get("limit")) || 200, 500);

  const where: SQL[] = [];
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    where.push(
      or(
        like(tables.companies.name, pattern),
        like(tables.companies.domain, pattern),
        like(tables.companies.industry, pattern),
      )!,
    );
  }
  if (industry) where.push(eq(tables.companies.industry, industry));

  const rows = db
    .select()
    .from(tables.companies)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(tables.companies.updatedAt))
    .limit(limit)
    .all();
  return json({ companies: rows.map((r) => ({ ...r, custom: JSON.parse(r.custom) })) });
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, companyInput);
  if (!body.ok) return body.response;

  const now = Date.now();
  const id = newId();
  const { custom, ...fields } = body.data;
  db.insert(tables.companies)
    .values({
      id,
      ...fields,
      ownerId: auth.user?.id ?? null,
      custom: JSON.stringify(custom ?? {}),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  logActivity({ type: "created", entityType: "company", entityId: id, actorId: auth.user?.id });
  const row = db.select().from(tables.companies).where(eq(tables.companies.id, id)).get()!;
  dispatchEvent({
    event: "company.created",
    entityType: "company",
    entityId: id,
    snapshot: { ...row, custom: undefined },
  });
  return json({ company: { ...row, custom: JSON.parse(row.custom) } }, { status: 201 });
}
