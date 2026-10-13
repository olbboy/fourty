"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCompact, formatMoney } from "@/lib/currency";
import { formatDate, displayName } from "@/lib/format";
import {
  Spinner,
  PriorityChip,
  ScoreBadge,
  HealthBadge,
  KpiCard,
  LoadError,
} from "@/components/ui";
import { MoneyBarChart, CountBarChart, FunnelChart } from "@/components/charts";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";
import { isDashboardStatsPayload } from "@/lib/stats-payload";

type Stats = {
  /** Reporting currency of every amount below; absent from older servers. */
  currency?: string;
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
  hotLeads: {
    id: string;
    name?: string;
    score?: number;
    status?: string;
    jobTitle?: string | null;
  }[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStats(value: unknown): value is Stats {
  if (
    !isRecord(value) ||
    !isDashboardStatsPayload(value) ||
    !isRecord(value.kpis)
  )
    return false;
  const kpis = value.kpis;
  return (
    ["openDeals", "contacts", "openTasks", "overdueTasks"].every(
      (key) => typeof kpis[key] === "number",
    ) &&
    ["winRate", "avgCycleDays"].every(
      (key) => kpis[key] === null || typeof kpis[key] === "number",
    )
  );
}

export function DashboardClient() {
  const t = useT();
  const locale = useLocale();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef<{
    controller: AbortController;
    generation: number;
  } | null>(null);
  const generationRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    requestRef.current = { controller, generation };
    setLoading(true);
    setFailed(false);
    setStats(null);

    try {
      const response = await fetch("/api/stats/dashboard", {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`Dashboard request failed with ${response.status}`);
      const payload: unknown = await response.json();
      if (!isStats(payload)) throw new Error("Dashboard response was invalid");
      if (generation !== generationRef.current || controller.signal.aborted)
        return;
      setStats(payload);
    } catch {
      if (controller.signal.aborted || generation !== generationRef.current)
        return;
      setFailed(true);
    } finally {
      if (requestRef.current?.generation === generation) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generationRef.current += 1;
      requestRef.current?.controller.abort();
      requestRef.current = null;
    };
  }, [load]);

  if (loading) return <Spinner label="Loading dashboard" />;
  if (failed || !stats) {
    return (
      <div className="animate-fade-up space-y-4">
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">
          {t("nav.dashboard")}
        </h1>
        <LoadError onRetry={() => void load()} />
      </div>
    );
  }

  const { kpis } = stats;
  const currency = stats.currency ?? "USD";

  return (
    <div className="animate-fade-up space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">
          {t("nav.dashboard")}
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">{t("dash.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t("dash.kpi.pipeline")}
          value={
            kpis.pipelineValue != null
              ? formatCompact(kpis.pipelineValue, currency, locale)
              : "—"
          }
          hint={t("dash.kpi.pipelineHint", { count: kpis.openDeals })}
        />
        <KpiCard
          label={t("dash.kpi.forecast")}
          value={
            kpis.weightedForecast != null
              ? formatCompact(kpis.weightedForecast, currency, locale)
              : "—"
          }
          hint={t("dash.kpi.forecastHint")}
        />
        <KpiCard
          label={t("dash.kpi.won")}
          value={
            kpis.wonThisMonth != null
              ? formatCompact(kpis.wonThisMonth, currency, locale)
              : "—"
          }
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
          <p className="mb-3 text-xs text-ink-muted">{t("dash.revenueHint", { currency })}</p>
          {stats.revenueByMonth.some((row) => row.won != null) ? (
            <MoneyBarChart
              currency={currency}
              locale={locale}
              data={stats.revenueByMonth}
              xKey="month"
              yKey="won"
            />
          ) : (
            <p className="text-sm text-ink-muted">{t("dash.amountsHidden")}</p>
          )}
        </Card>
        <Card size="flush" className="p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("dash.funnel")}</h2>
          <p className="mb-3 text-xs text-ink-muted">
            {stats.funnel.some((funnel) => funnel.value != null)
              ? t("dash.funnelValue")
              : t("dash.funnelCount")}
          </p>
          <FunnelChart data={stats.funnel} currency={currency} locale={locale} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card size="flush" className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("dash.hotLeads")}</h2>
          <div className="space-y-2">
            {stats.hotLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/contacts/${lead.id}`}
                className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {displayName(lead.name)}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {lead.jobTitle ?? lead.status ?? "—"}
                  </p>
                </div>
                <ScoreBadge score={lead.score} />
              </Link>
            ))}
            {stats.hotLeads.length === 0 && (
              <p className="text-sm text-ink-muted">
                {t("dash.hotLeadsEmpty")}
              </p>
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
              <div
                key={task.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2"
              >
                <p className="min-w-0 truncate text-sm">{task.title}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <PriorityChip priority={task.priority} />
                  <span
                    className={`text-xs ${task.overdue ? "font-semibold text-feedback-error" : "text-ink-muted"}`}
                  >
                    {formatDate(task.dueDate, locale)}
                  </span>
                </div>
              </div>
            ))}
            {stats.dueTasks.length === 0 && (
              <p className="text-sm text-ink-muted">{t("dash.nothingDue")}</p>
            )}
          </div>
          <Link
            href="/tasks"
            className="mt-3 block text-xs font-medium text-accent-700 hover:underline dark:text-accent-400"
          >
            {t("dash.allTasks")}
          </Link>
        </Card>

        <Card size="flush" className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("dash.staleDeals")}</h2>
          <p className="mb-2 text-xs text-ink-muted">{t("dash.staleHint")}</p>
          <div className="space-y-2">
            {stats.staleDeals.map((deal) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {displayName(deal.name)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {[
                      deal.amount != null
                        ? formatMoney(deal.amount, deal.currency ?? "USD", locale)
                        : null,
                      deal.stage,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <HealthBadge score={deal.score} />
                  <span className="text-xs font-semibold text-feedback-warn">
                    {t("time.daysShort", { n: deal.daysInStage })}
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
        <CountBarChart
          data={stats.activityByWeek}
          xKey="week"
          yKey="count"
          label={t("dash.activities")}
          height={180}
        />
      </Card>
    </div>
  );
}
