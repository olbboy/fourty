import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { audit } from "@/lib/audit";
import { dispatchEvent } from "@/lib/workflows/engine";
import { companyInput } from "@/lib/validators";
import { loadFieldPolicy, redact, blockedWrites } from "@/lib/field-permissions";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const industry = params.get("industry");
  const limit = Math.min(Number(params.get("limit")) || 200, 500);

  const where: SQL[] = [];
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    where.push(
      or(
        ilike(tables.companies.name, pattern),
        ilike(tables.companies.domain, pattern),
        ilike(tables.companies.industry, pattern),
      )!,
    );
  }
  if (industry) where.push(eq(tables.companies.industry, industry));

  const rows = await db
    .select()
    .from(tables.companies)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(tables.companies.updatedAt))
    .limit(limit);
  const policy = await loadFieldPolicy(auth.role);
  return json({
    companies: rows.map((r) => redact(policy, "companies", { ...r, custom: JSON.parse(r.custom) })),
  });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
  const denied = authorize(auth, "companies", "create");
  if (denied) return denied;
  const body = await parseBody(req, companyInput);
  if (!body.ok) return body.response;

  const policy = await loadFieldPolicy(auth.role);
  const blocked = blockedWrites(policy, "companies", body.keys);
  if (blocked.length) return apiError(`Not permitted to set field(s): ${blocked.join(", ")}`, 403);

  const now = Date.now();
  const id = newId();
  const { custom, ...fields } = body.data;
  await db.insert(tables.companies)
    .values({
      id,
      ...fields,
      ownerId: auth.user?.id ?? null,
      custom: JSON.stringify(custom ?? {}),
      createdAt: now,
      updatedAt: now,
    });
  await logActivity({ type: "created", entityType: "company", entityId: id, actorId: auth.user?.id });
  await audit(auth.user?.id, "company.created", { objectType: "company", objectId: id });
  const row = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0]!;
  await dispatchEvent({
    event: "company.created",
    entityType: "company",
    entityId: id,
    snapshot: { ...row, custom: undefined },
  });
  return json(
    { company: redact(policy, "companies", { ...row, custom: JSON.parse(row.custom) }) },
    { status: 201 },
  );
  });
}
