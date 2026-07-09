import { and, desc, eq, gte } from "drizzle-orm";
import { db, tables } from "@/db";
import { computeDealScore } from "@/lib/deal-scoring";

const DAY = 86400000;

/**
 * Recompute and persist the health score for one deal. Mirrors the contact-score
 * adapter (src/lib/services/contact-score.ts): gather live inputs, call the pure
 * scorer, write `score` back onto the deal. Must run inside withWorkspace().
 */
export async function recomputeDealScore(dealId: string): Promise<number> {
  const deal = (
    await db.select().from(tables.deals).where(eq(tables.deals.id, dealId)).limit(1)
  )[0];
  if (!deal) return 0;

  const stage = (
    await db.select().from(tables.stages).where(eq(tables.stages.id, deal.stageId)).limit(1)
  )[0];

  const now = Date.now();
  const since = now - 30 * DAY;
  const recent = await db
    .select({ createdAt: tables.activities.createdAt })
    .from(tables.activities)
    .where(
      and(
        eq(tables.activities.entityType, "deal"),
        eq(tables.activities.entityId, dealId),
        gte(tables.activities.createdAt, since),
      ),
    );

  const last = (
    await db
      .select({ createdAt: tables.activities.createdAt })
      .from(tables.activities)
      .where(and(eq(tables.activities.entityType, "deal"), eq(tables.activities.entityId, dealId)))
      .orderBy(desc(tables.activities.createdAt))
      .limit(1)
  )[0];

  const stageType = stage?.type ?? "open";
  const score = computeDealScore({
    stageType,
    winProbability: stage?.winProbability ?? 50,
    daysInStage: Math.max(0, Math.floor((now - deal.stageEnteredAt) / DAY)),
    activityCount30d: recent.length,
    daysSinceLastActivity: last ? Math.floor((now - last.createdAt) / DAY) : null,
    isOverdue: stageType === "open" && deal.expectedCloseDate != null && deal.expectedCloseDate < now,
    hasContact: !!deal.contactId,
  });

  await db.update(tables.deals).set({ score }).where(eq(tables.deals.id, dealId));
  return score;
}
