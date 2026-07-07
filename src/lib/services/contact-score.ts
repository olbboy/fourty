import { and, eq, gte, inArray, desc } from "drizzle-orm";
import { db, tables } from "@/db";
import { computeLeadScore } from "@/lib/scoring";

/** Recompute and persist the lead score for one contact. Returns the score. */
export async function recomputeContactScore(contactId: string): Promise<number> {
  const contact = (
    await db.select().from(tables.contacts).where(eq(tables.contacts.id, contactId)).limit(1)
  )[0];
  if (!contact) return 0;

  const since = Date.now() - 30 * 86400000;
  const recent = await db
    .select({ createdAt: tables.activities.createdAt })
    .from(tables.activities)
    .where(
      and(
        eq(tables.activities.entityType, "contact"),
        eq(tables.activities.entityId, contactId),
        gte(tables.activities.createdAt, since),
      ),
    );

  const last = (
    await db
      .select({ createdAt: tables.activities.createdAt })
      .from(tables.activities)
      .where(
        and(eq(tables.activities.entityType, "contact"), eq(tables.activities.entityId, contactId)),
      )
      .orderBy(desc(tables.activities.createdAt))
      .limit(1)
  )[0];

  const contactDeals = await db
    .select({ id: tables.deals.id, stageId: tables.deals.stageId })
    .from(tables.deals)
    .where(eq(tables.deals.contactId, contactId));

  let openDeals = 0;
  let wonDeals = 0;
  if (contactDeals.length > 0) {
    const stageRows = await db
      .select({ id: tables.stages.id, type: tables.stages.type })
      .from(tables.stages)
      .where(inArray(tables.stages.id, [...new Set(contactDeals.map((d) => d.stageId))]));
    const stageType = new Map(stageRows.map((s) => [s.id, s.type]));
    for (const d of contactDeals) {
      const t = stageType.get(d.stageId) ?? "open";
      if (t === "won") wonDeals++;
      else if (t === "open") openDeals++;
    }
  }

  const score = computeLeadScore({
    hasEmail: !!contact.email,
    hasPhone: !!contact.phone,
    hasJobTitle: !!contact.jobTitle,
    hasCompany: !!contact.companyId,
    hasLinkedin: !!contact.linkedin,
    status: contact.status,
    source: contact.source,
    activityCount30d: recent.length,
    daysSinceLastActivity: last ? Math.floor((Date.now() - last.createdAt) / 86400000) : null,
    openDealCount: openDeals,
    wonDealCount: wonDeals,
  });

  await db
    .update(tables.contacts)
    .set({ score, lastActivityAt: last?.createdAt ?? contact.lastActivityAt })
    .where(eq(tables.contacts.id, contactId));
  return score;
}
