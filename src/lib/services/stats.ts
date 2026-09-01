import { db, tables } from "@/db";
import { convert } from "@/lib/currency";
import { canReadField, loadFieldPolicy, redact, type FieldPolicy } from "@/lib/field-permissions";

const DAY = 86400000;

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

export async function computeDashboardStats() {
  const now = Date.now();
  const stages = await db.select().from(tables.stages);
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const deals = await db.select().from(tables.deals);
  const contacts = await db.select().from(tables.contacts);
  const tasks = await db.select().from(tables.tasks);
  const activities = await db.select().from(tables.activities);

  const usd = (d: { amount: number; currency: string }) => convert(d.amount, d.currency, "USD");

  const open = deals.filter((d) => stageById.get(d.stageId)?.type === "open");
  const won = deals.filter((d) => stageById.get(d.stageId)?.type === "won");
  const lost = deals.filter((d) => stageById.get(d.stageId)?.type === "lost");

  const pipelineValue = open.reduce((s, d) => s + usd(d), 0);
  const weightedForecast = open.reduce(
    (s, d) => s + usd(d) * ((stageById.get(d.stageId)?.winProbability ?? 0) / 100),
    0,
  );

  const startOfMonth = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const wonThisMonth = won
    .filter((d) => (d.closedAt ?? 0) >= startOfMonth)
    .reduce((s, d) => s + usd(d), 0);

  const closed90 = deals.filter(
    (d) => d.closedAt && d.closedAt >= now - 90 * DAY && stageById.get(d.stageId)?.type !== "open",
  );
  const won90 = closed90.filter((d) => stageById.get(d.stageId)?.type === "won");
  const winRate = closed90.length ? Math.round((won90.length / closed90.length) * 100) : null;

  const avgDealSize = won.length ? won.reduce((s, d) => s + usd(d), 0) / won.length : 0;

  // Average sales-cycle length (creation → close) for deals won in the last 180d
  const recentWon = won.filter((d) => d.closedAt && d.closedAt >= now - 180 * DAY);
  const avgCycleDays = recentWon.length
    ? Math.round(recentWon.reduce((s, d) => s + (d.closedAt! - d.createdAt), 0) / recentWon.length / DAY)
    : null;

  // Funnel: open stages in order with counts + value
  const funnel = stages
    .filter((s) => s.type === "open")
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const inStage = open.filter((d) => d.stageId === s.id);
      return {
        stage: s.name,
        count: inStage.length,
        value: Math.round(inStage.reduce((sum, d) => sum + usd(d), 0)),
      };
    });

  // Revenue by month, last 6 months (won deals by closedAt)
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    months.push(monthKey(new Date(d.getFullYear(), d.getMonth() - i, 1).getTime()));
  }
  const revenueByMonth = months.map((key) => ({
    month: monthLabel(key),
    won: Math.round(
      won.filter((d) => d.closedAt && monthKey(d.closedAt) === key).reduce((s, d) => s + usd(d), 0),
    ),
    lost: Math.round(
      lost
        .filter((d) => d.closedAt && monthKey(d.closedAt) === key)
        .reduce((s, d) => s + usd(d), 0),
    ),
  }));

  // Activity per week, last 8 weeks
  const activityByWeek = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    return {
      week: new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: activities.filter((a) => a.createdAt > start && a.createdAt <= end).length,
    };
  });

  const hotLeads = contacts
    .filter((c) => c.status !== "churned")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      score: c.score,
      status: c.status,
      jobTitle: c.jobTitle,
    }));

  const openTasks = tasks.filter((t) => !t.completedAt);
  const dueTasks = openTasks
    .filter((t) => t.dueDate)
    .sort((a, b) => a.dueDate! - b.dueDate!)
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      overdue: t.dueDate! < now,
      entityType: t.entityType,
      entityId: t.entityId,
    }));

  // Stale open deals: sitting in a stage > 14 days
  const staleDeals = open
    .filter((d) => now - d.stageEnteredAt > 14 * DAY)
    .sort((a, b) => a.stageEnteredAt - b.stageEnteredAt)
    .slice(0, 5)
    .map((d) => ({
      id: d.id,
      name: d.name,
      amount: d.amount,
      currency: d.currency,
      stage: stageById.get(d.stageId)?.name ?? "",
      daysInStage: Math.floor((now - d.stageEnteredAt) / DAY),
      score: d.score,
    }));

  return {
    kpis: {
      pipelineValue: Math.round(pipelineValue),
      weightedForecast: Math.round(weightedForecast),
      wonThisMonth: Math.round(wonThisMonth),
      winRate,
      avgDealSize: Math.round(avgDealSize),
      avgCycleDays,
      openDeals: open.length,
      contacts: contacts.length,
      openTasks: openTasks.length,
      overdueTasks: openTasks.filter((t) => t.dueDate && t.dueDate < now).length,
    },
    funnel,
    revenueByMonth,
    activityByWeek,
    hotLeads,
    dueTasks,
    staleDeals,
  };
}

export async function computeReportStats() {
  const now = Date.now();
  const stages = await db.select().from(tables.stages);
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const deals = await db.select().from(tables.deals);
  const contacts = await db.select().from(tables.contacts);

  const usd = (d: { amount: number; currency: string }) => convert(d.amount, d.currency, "USD");
  const open = deals.filter((d) => stageById.get(d.stageId)?.type === "open");

  // Lead sources: volume + conversion to customer
  const sources = ["website", "referral", "outbound", "event", "other"];
  const sourceBreakdown = sources
    .map((source) => {
      const inSource = contacts.filter((c) => (c.source ?? "other") === source);
      const customers = inSource.filter((c) => c.status === "customer");
      return {
        source,
        leads: inSource.length,
        customers: customers.length,
        conversion: inSource.length ? Math.round((customers.length / inSource.length) * 100) : 0,
      };
    })
    .filter((s) => s.leads > 0);

  // Win/loss by month (count), last 6 months
  const winLoss = Array.from({ length: 6 }, (_, i) => {
    const ref = new Date(now);
    const d = new Date(ref.getFullYear(), ref.getMonth() - (5 - i), 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    const closed = deals.filter((x) => x.closedAt && x.closedAt >= start && x.closedAt < end);
    return {
      month: d.toLocaleDateString("en-US", { month: "short" }),
      won: closed.filter((x) => stageById.get(x.stageId)?.type === "won").length,
      lost: closed.filter((x) => stageById.get(x.stageId)?.type === "lost").length,
    };
  });

  // Pipeline aging: every open deal with days in stage
  const aging = open
    .map((d) => ({
      id: d.id,
      name: d.name,
      stage: stageById.get(d.stageId)?.name ?? "",
      amountUsd: Math.round(usd(d)),
      daysInStage: Math.floor((now - d.stageEnteredAt) / 86400000),
      expectedCloseDate: d.expectedCloseDate,
      overdue: !!d.expectedCloseDate && d.expectedCloseDate < now,
      score: d.score,
    }))
    .sort((a, b) => b.daysInStage - a.daysInStage);

  // Score distribution
  const scoreBands = [
    { band: "Cold (0-39)", count: contacts.filter((c) => c.score < 40).length },
    { band: "Warm (40-69)", count: contacts.filter((c) => c.score >= 40 && c.score < 70).length },
    { band: "Hot (70+)", count: contacts.filter((c) => c.score >= 70).length },
  ];

  const statusBreakdown = ["lead", "qualified", "customer", "churned"].map((status) => ({
    status,
    count: contacts.filter((c) => c.status === status).length,
  }));

  return { sourceBreakdown, winLoss, aging, scoreBands, statusBreakdown };
}

type DashboardStats = Awaited<ReturnType<typeof computeDashboardStats>>;
type ReportStats = Awaited<ReturnType<typeof computeReportStats>>;

function withoutKeys<T extends object>(row: T, keys: readonly (keyof T)[]): T {
  const out = { ...row };
  for (const key of keys) delete out[key];
  return out;
}

/** Stage name is derived from `stageId`; redact it under the same rule. */
function redactDealSummary<T extends Record<string, unknown>>(policy: FieldPolicy | null, row: T): T {
  const out = { ...row };
  if (!canReadField(policy, "deals", "stageId")) delete out.stage;
  return redact(policy, "deals", out);
}

function visiblePersonName(row: { firstName?: unknown; lastName?: unknown }): string | undefined {
  const s = [row.firstName, row.lastName]
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(" ")
    .trim();
  return s || undefined;
}

/** Strip unreadable per-record fields and amount-derived aggregates (ADR-011). */
export function applyFieldPolicyToDashboard(policy: FieldPolicy | null, stats: DashboardStats): DashboardStats {
  const hideAmount = !canReadField(policy, "deals", "amount");
  return {
    ...stats,
    kpis: hideAmount
      ? withoutKeys(stats.kpis, ["pipelineValue", "weightedForecast", "wonThisMonth", "avgDealSize"])
      : stats.kpis,
    funnel: hideAmount ? stats.funnel.map((row) => withoutKeys(row, ["value"])) : stats.funnel,
    revenueByMonth: hideAmount
      ? stats.revenueByMonth.map((row) => withoutKeys(row, ["won", "lost"]))
      : stats.revenueByMonth,
    hotLeads: stats.hotLeads.map((row) => {
      const r = redact(policy, "contacts", { ...row });
      const name = visiblePersonName(r);
      const { firstName: _f, lastName: _l, ...rest } = r;
      return { ...rest, ...(name ? { name } : {}) } as (typeof stats.hotLeads)[number];
    }),
    staleDeals: stats.staleDeals.map((row) => redactDealSummary(policy, { ...row })),
  };
}

/** Strip unreadable per-record fields from report lists. `amountUsd` is deals.amount. */
export function applyFieldPolicyToReports(policy: FieldPolicy | null, stats: ReportStats): ReportStats {
  const hideAmount = !canReadField(policy, "deals", "amount");
  const hideClose = !canReadField(policy, "deals", "expectedCloseDate");
  return {
    ...stats,
    aging: stats.aging.map((row) => {
      const out: Record<string, unknown> = { ...row };
      if (hideAmount) delete out.amountUsd;
      if (hideClose) delete out.overdue;
      return redactDealSummary(policy, out) as typeof row;
    }),
  };
}

export async function dashboardStatsForRole(role: string): Promise<DashboardStats> {
  const policy = await loadFieldPolicy(role);
  return applyFieldPolicyToDashboard(policy, await computeDashboardStats());
}

export async function reportStatsForRole(role: string): Promise<ReportStats> {
  const policy = await loadFieldPolicy(role);
  return applyFieldPolicyToReports(policy, await computeReportStats());
}
