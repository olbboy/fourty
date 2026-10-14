import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { convertAt } from "@/lib/currency";
import { canReadField, loadFieldPolicy } from "@/lib/field-permissions";
import { quarterOf, quarterRange } from "@/lib/forecast";
import { ownerTable, type OwnerRow } from "@/lib/owner-targets";
import { loadReportingSettings } from "@/lib/reporting";
import { getAssignee, listMembersForDisplay } from "./assignees";
import { defineAction } from "./define";
import { register } from "./registry";
import { ActionError } from "./types";

const period = z.string().regex(/^\d{4}-Q[1-4]$/, 'expected a quarter like "2026-Q4"');

/** An admin sets (or, with null, clears) a member's Target for a quarter. */
export const targetsSet = defineAction({
  name: "targets.set",
  object: "settings",
  verb: "update",
  description: "Set a member's target for a quarter, in the reporting currency; amount null clears it.",
  input: z.object({ userId: z.string().min(1), period, amount: z.number().min(0).max(1e15).nullable() }),
  expose: { rest: true },
  run: async ({ userId, period, amount }, ctx): Promise<{ userId: string; period: string; amount: number | null }> => {
    if (!(await getAssignee(userId))) throw new ActionError("invalid", "userId: not a workspace member");
    const mine = and(eq(tables.targets.userId, userId), eq(tables.targets.period, period));
    if (amount === null) {
      await db.delete(tables.targets).where(mine);
    } else {
      await db
        .insert(tables.targets)
        .values({ id: newId(), userId, period, amount, updatedBy: ctx.userId, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: [tables.targets.workspaceId, tables.targets.userId, tables.targets.period],
          set: { amount, updatedBy: ctx.userId, updatedAt: Date.now() },
        });
    }
    return { userId, period, amount };
  },
  effects: { audit: (_i, out) => ({ key: "target.set", objectType: "user", objectId: out.userId, meta: { period: out.period, amount: out.amount } }) },
});

/**
 * The owner table of one quarter (default: this one). A role that cannot
 * read deal amounts gets the counts with every amount left out.
 */
export const ownerStats = defineAction({
  name: "stats.owners",
  object: "deals",
  verb: "read",
  description: "Per owner for a quarter: target, won and lost, open and weighted forecast, attainment.",
  input: z.object({ period: period.optional() }),
  expose: { rest: true },
  run: async ({ period: asked }, ctx): Promise<{ period: string; currency: string; owners: Partial<OwnerRow>[] }> => {
    const label = asked ?? quarterOf(Date.now());
    const range = quarterRange(label)!;
    const reporting = await loadReportingSettings();
    const [deals, stages, targets, people] = await Promise.all([
      db
        .select({
          ownerId: tables.deals.ownerId,
          amount: tables.deals.amount,
          currency: tables.deals.currency,
          stageId: tables.deals.stageId,
          closedAt: tables.deals.closedAt,
          expectedCloseDate: tables.deals.expectedCloseDate,
        })
        .from(tables.deals),
      db.select({ id: tables.stages.id, type: tables.stages.type, winProbability: tables.stages.winProbability }).from(tables.stages),
      db.select().from(tables.targets).where(eq(tables.targets.period, label)),
      listMembersForDisplay(),
    ]);
    const owners = ownerTable({
      deals,
      stages,
      targets: new Map(targets.map((t) => [t.userId, t.amount])),
      people,
      range,
      toReporting: (amount, currency) => convertAt(amount, currency, reporting.currency, reporting),
    });
    if (canReadField(await loadFieldPolicy(ctx.role), "deals", "amount")) return { period: label, currency: reporting.currency, owners };
    return {
      period: label,
      currency: reporting.currency,
      owners: owners.map(({ target: _t, won: _w, open: _o, weighted: _we, attainment: _a, ...counts }) => counts),
    };
  },
});

register(targetsSet);
register(ownerStats);
