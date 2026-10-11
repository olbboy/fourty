import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { audit } from "@/lib/audit";
import { dispatchEvent } from "@/lib/workflows/engine";
import { companyInput } from "@/lib/validators";
import { loadFieldPolicy, redact, blockedWrites } from "@/lib/field-permissions";
import { companyQueryPolicy, normalizeCompanyQuery } from "@/lib/company-query";
import { companyList } from "@/lib/company-list";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "companies", "read");
    if (denied) return denied;
    const parsed = normalizeCompanyQuery(new URL(req.url).searchParams);
    if (!parsed.ok) return apiError(parsed.message, 400);
    const policy = await loadFieldPolicy(auth.role);
    const allowed = companyQueryPolicy(parsed.value, policy);
    if (!allowed.ok) return apiError(allowed.message, allowed.status);
    return json(await companyList(parsed.value, allowed, policy));
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
