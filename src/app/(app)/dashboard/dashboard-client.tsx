"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCompact, formatMoney } from "@/lib/currency";
import { formatDate, displayName } from "@/lib/format";
import { Spinner, PriorityChip, ScoreBadge, HealthBadge, KpiCard, LoadError } from "@/components/ui";
import { MoneyBarChart, CountBarChart, FunnelChart } from "@/components/charts";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";
import { isDashboardStatsPayload } from "@/lib/stats-payload";

type Stats = {
  kpis: {
    pipelineValue?: number;
    weightedForecast?: number;
    wonThisMonth?: number;
    winRate: number | null;
    avgDealSize?: number;
    avgCycleDays: number | null;
    openDeals: number;
    contacts: number;
    openTasks: number;
    overdueTasks: number;
  };
  funnel: { stage: string; count: number; value?: number }[];
  revenueByMonth: { month: string; won?: number; lost?: number }[];
  activityByWeek: { week: string; count: number }[];
  hotLeads: { id: string; name?: string; score?: number; status?: string; jobTitle?: string | null }[];
  dueTasks: {
    id: string;
    title: string;
    dueDate: number | null;
    priority: string;
    overdue: boolean;
    entityType: string | null;
    entityId: string | null;
  }[];
  staleDeals: {
    id: string;
    name: string;
    amount?: number;
    currency?: string;
    stage?: string;
    daysInStage: number;
    score?: number;
  }[];
};

export function DashboardClient() {
  const t = useT();
  const locale = useLocale();
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setStats(null);
    fetch("/api/stats/dashboard")
      .then(async (r) => {
        if (!r.ok) throw new Error("stats");
        const data: unknown = await r.json();
        if (!isDashboardStatsPayload(data)) throw new Error("stats");
        if (!cancelled) setStats(data as Stats);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  if (failed) {
    return (
      <div className="animate-fade-up space-y-4">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{t("nav.dashboard")}</h1>
        <LoadError onRetry={() => setRetry((n) => n + 1)} />
      </div>
    );
  }

  if (!stats) return <Spinner />;
  const { kpis } = stats;

  return (
    <div className="animate-fade-up space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{t("nav.dashboard")}</h1>
        <p className="mt-0.5 text-sm text-ink-muted">{t("dash.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t("dash.kpi.pipeline")}
          value={kpis.pipelineValue != null ? formatCompact(kpis.pipelineValue, "USD") : "—"}
          hint={t("dash.kpi.pipelineHint", { count: kpis.openDeals })}
        />
        <KpiCard
          label={t("dash.kpi.forecast")}
          value={kpis.weightedForecast != null ? formatCompact(kpis.weightedForecast, "USD") : "—"}
          hint={t("dash.kpi.forecastHint")}
        />
        <KpiCard
          label={t("dash.kpi.won")}
          value={kpis.wonThisMonth != null ? formatCompact(kpis.wonThisMonth, "USD") : "—"}
        />
        <KpiCard
          label={t("dash.kpi.winRate")}
          value={kpis.winRate === null ? "—" : `${kpis.winRate}%`}
          hint={
            kpis.avgCycleDays !== null
              ? t("dash.kpi.cycleHint", { days: kpis.avgCycleDays })
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card size="flush" className="p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("dash.revenue")}</h2>
          <p className="mb-3 text-xs text-ink-muted">{t("dash.revenueHint")}</p>
          {stats.revenueByMonth.some((r) => r.won != null) ? (
            <MoneyBarChart data={stats.revenueByMonth} xKey="month" yKey="won" />
          ) : (
            <p className="text-sm text-ink-muted">{t("dash.amountsHidden")}</p>
          )}
        </Card>
        <Card size="flush" className="p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("dash.funnel")}</h2>
          <p className="mb-3 text-xs text-ink-muted">
            {stats.funnel.some((f) => f.value != null) ? t("dash.funnelValue") : t("dash.funnelCount")}
          </p>
          <FunnelChart data={stats.funnel} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card size="flush" className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("dash.hotLeads")}</h2>
          <div className="space-y-2">
            {stats.hotLeads.map((l) => (
              <Link
                key={l.id}
                href={`/contacts/${l.id}`}
                className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayName(l.name)}</p>
                  <p className="truncate text-xs text-ink-muted">{l.jobTitle ?? l.status ?? "—"}</p>
                </div>
                <ScoreBadge score={l.score} />
              </Link>
            ))}
            {stats.hotLeads.length === 0 && (
              <p className="text-sm text-ink-muted">{t("dash.hotLeadsEmpty")}</p>
            )}
          </div>
        </Card>

        <Card size="flush" className="p-4">
          <h2 className="mb-3 text-sm font-semibold">
            {t("dash.tasksDue")}{" "}
            {kpis.overdueTasks > 0 && (
              <span className="chip bg-feedback-error-wash text-feedback-error">
                {t("dash.overdueCount", { count: kpis.overdueTasks })}
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {stats.dueTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                <p className="min-w-0 truncate text-sm">{task.title}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <PriorityChip priority={task.priority} />
                  <span className={`text-xs ${task.overdue ? "font-semibold text-feedback-error" : "text-ink-muted"}`}>
                    {formatDate(task.dueDate, locale)}
                  </span>
                </div>
              </div>
            ))}
            {stats.dueTasks.length === 0 && <p className="text-sm text-ink-muted">{t("dash.nothingDue")}</p>}
          </div>
          <Link href="/tasks" className="mt-3 block text-xs font-medium text-accent-700 hover:underline dark:text-accent-400">
            {t("dash.allTasks")}
          </Link>
        </Card>

        <Card size="flush" className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("dash.staleDeals")}</h2>
          <p className="mb-2 text-xs text-ink-muted">{t("dash.staleHint")}</p>
          <div className="space-y-2">
            {stats.staleDeals.map((d) => (
              <Link
                key={d.id}
                href={`/deals/${d.id}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayName(d.name)}</p>
                  <p className="text-xs text-ink-muted">
                    {[d.amount != null ? formatMoney(d.amount, d.currency ?? "USD") : null, d.stage]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <HealthBadge score={d.score} />
                  <span className="text-xs font-semibold text-feedback-warn">
                    {t("time.daysShort", { n: d.daysInStage })}
                  </span>
                </div>
              </Link>
            ))}
            {stats.staleDeals.length === 0 && (
              <p className="text-sm text-ink-muted">{t("dash.staleEmpty")}</p>
            )}
          </div>
        </Card>
      </div>

      <Card size="flush" className="p-4">
        <h2 className="mb-1 text-sm font-semibold">{t("dash.activity")}</h2>
        <p className="mb-3 text-xs text-ink-muted">{t("dash.activityHint")}</p>
        <CountBarChart data={stats.activityByWeek} xKey="week" yKey="count" label={t("dash.activities")} height={180} />
      </Card>
    </div>
  );
}
