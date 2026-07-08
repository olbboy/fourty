import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { audit } from "@/lib/audit";
import { dispatchEvent } from "@/lib/workflows/engine";
import { dealInput } from "@/lib/validators";
import { ensureDefaultPipeline } from "@/db/seed";
import { loadFieldPolicy, redact, blockedWrites } from "@/lib/field-permissions";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const stageId = params.get("stageId");
  const pipelineId = params.get("pipelineId");
  const companyId = params.get("companyId");
  const contactId = params.get("contactId");
  const limit = Math.min(Number(params.get("limit")) || 300, 1000);

  const where: SQL[] = [];
  if (q) where.push(ilike(tables.deals.name, `%${q.replace(/[%_]/g, "")}%`));
  if (stageId) where.push(eq(tables.deals.stageId, stageId));
  if (pipelineId) where.push(eq(tables.deals.pipelineId, pipelineId));
  if (companyId) where.push(eq(tables.deals.companyId, companyId));
  if (contactId) where.push(eq(tables.deals.contactId, contactId));

  const rows = await db
    .select()
    .from(tables.deals)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(tables.deals.updatedAt))
    .limit(limit);
  const policy = await loadFieldPolicy(auth.role);
  return json({ deals: rows.map((r) => redact(policy, "deals", { ...r, custom: JSON.parse(r.custom) })) });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
  const denied = authorize(auth, "deals", "create");
  if (denied) return denied;
  const body = await parseBody(req, dealInput);
  if (!body.ok) return body.response;

  const policy = await loadFieldPolicy(auth.role);
  const blocked = blockedWrites(policy, "deals", body.keys);
  if (blocked.length) return apiError(`Not permitted to set field(s): ${blocked.join(", ")}`, 403);

  const pipelineId = body.data.pipelineId ?? (await ensureDefaultPipeline());
  let stageId = body.data.stageId;
  if (!stageId) {
    const first = (await db
      .select()
      .from(tables.stages)
      .where(eq(tables.stages.pipelineId, pipelineId))
      .orderBy(tables.stages.order)
      .limit(1))[0];
    if (!first) return apiError("Pipeline has no stages");
    stageId = first.id;
  } else {
    const stage = (await db.select().from(tables.stages).where(eq(tables.stages.id, stageId)).limit(1))[0];
    if (!stage || stage.pipelineId !== pipelineId) return apiError("Invalid stage for pipeline");
  }

  const now = Date.now();
  const id = newId();
  const { custom, ...fields } = body.data;
  await db.insert(tables.deals)
    .values({
      id,
      ...fields,
      pipelineId,
      stageId,
      ownerId: auth.user?.id ?? null,
      stageEnteredAt: now,
      custom: JSON.stringify(custom ?? {}),
      createdAt: now,
      updatedAt: now,
    });
  await logActivity({ type: "created", entityType: "deal", entityId: id, actorId: auth.user?.id });
  await audit(auth.user?.id, "deal.created", { objectType: "deal", objectId: id });
  const row = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0]!;
  await dispatchEvent({
    event: "deal.created",
    entityType: "deal",
    entityId: id,
    snapshot: { ...row, custom: undefined },
  });
  return json({ deal: redact(policy, "deals", { ...row, custom: JSON.parse(row.custom) }) }, { status: 201 });
  });
}
