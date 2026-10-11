import { and, eq, inArray, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { computeDealScore } from "@/lib/deal-scoring";

const DAY = 86400000;
// Each chunk leaves ample room for the two ids per CASE arm plus the WHERE
// list, so a large stage cannot exhaust PostgreSQL's bind-parameter limit.
const SCORE_CHUNK_SIZE = 200;

type DealScoreRow = {
  id: string;
  stageEnteredAt: number;
  expectedCloseDate: number | null;
  contactId: string | null;
  stageType: string | null;
  winProbability: number | null;
};

type ActivitySummary = {
  entityId: string;
  recentCount: number;
  lastActivityAt: number | null;
};

/**
 * Recompute and persist the health scores for a set of deals in bounded queries.
 * The scorer remains the same pure function used by the single-deal adapter;
 * only the data gathering and write are batched. Must run inside withWorkspace().
 */
export async function recomputeDealScores(dealIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(dealIds)];
  if (ids.length === 0) return new Map();

  const now = Date.now();
  const since = now - 30 * DAY;
  const result = new Map<string, number>();

  for (let offset = 0; offset < ids.length; offset += SCORE_CHUNK_SIZE) {
    const chunkIds = ids.slice(offset, offset + SCORE_CHUNK_SIZE);
    const deals = (await db
      .select({
        id: tables.deals.id,
        stageEnteredAt: tables.deals.stageEnteredAt,
        expectedCloseDate: tables.deals.expectedCloseDate,
        contactId: tables.deals.contactId,
        stageType: tables.stages.type,
        winProbability: tables.stages.winProbability,
      })
      .from(tables.deals)
      .leftJoin(tables.stages, eq(tables.stages.id, tables.deals.stageId))
      .where(inArray(tables.deals.id, chunkIds))
      .for("update", { of: tables.deals })) as DealScoreRow[];

    if (deals.length === 0) continue;

    const activities = (await db
      .select({
        entityId: tables.activities.entityId,
        recentCount: sql<number>`count(*) filter (where ${tables.activities.createdAt} >= ${since})`,
        lastActivityAt: sql<number | null>`max(${tables.activities.createdAt})`,
      })
      .from(tables.activities)
      .where(
        and(
          eq(tables.activities.entityType, "deal"),
          inArray(
            tables.activities.entityId,
            deals.map((deal) => deal.id),
          ),
        ),
      )
      .groupBy(tables.activities.entityId)) as ActivitySummary[];
    const activityByDeal = new Map(activities.map((activity) => [activity.entityId, activity]));

    const scored = deals.map((deal) => {
      const activity = activityByDeal.get(deal.id);
      const stageType = deal.stageType ?? "open";
      const score = computeDealScore({
        stageType,
        winProbability: deal.winProbability ?? 50,
        daysInStage: Math.max(0, Math.floor((now - deal.stageEnteredAt) / DAY)),
        activityCount30d: activity?.recentCount ?? 0,
        daysSinceLastActivity:
          activity?.lastActivityAt == null ? null : Math.floor((now - activity.lastActivityAt) / DAY),
        isOverdue: stageType === "open" && deal.expectedCloseDate != null && deal.expectedCloseDate < now,
        hasContact: !!deal.contactId,
      });
      return { id: deal.id, score };
    });

    // A single CASE update keeps each chunk set-based and avoids one UPDATE per
    // deal while a pipeline membership lock is held.
    const cases = scored.map(({ id, score }) =>
      sql`when ${tables.deals.id} = ${id} then ${score}`,
    );
    await db
      .update(tables.deals)
      .set({
        score: sql<number>`case ${sql.join(cases, sql.raw(" "))} else ${tables.deals.score} end`,
      })
      .where(inArray(tables.deals.id, scored.map((deal) => deal.id)));

    for (const deal of scored) result.set(deal.id, deal.score);
  }

  return result;
}

/** Recompute and persist one deal's health score using the batch path. */
export async function recomputeDealScore(dealId: string): Promise<number> {
  return (await recomputeDealScores([dealId])).get(dealId) ?? 0;
}
