"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCompact, formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { Spinner, PriorityChip, ScoreBadge } from "@/components/ui";
import { MoneyBarChart, CountBarChart, FunnelChart } from "@/components/charts";

type Stats = {
  kpis: {
    pipelineValue: number;
    weightedForecast: number;
    wonThisMonth: number;
    winRate: number | null;
    avgDealSize: number;
    avgCycleDays: number | null;
    openDeals: number;
    contacts: number;
    openTasks: number;
    overdueTasks: number;
  };
  funnel: { stage: string; count: number; value: number }[];
  revenueByMonth: { month: string; won: number; lost: number }[];
  activityByWeek: { week: string; count: number }[];
  hotLeads: { id: string; name: string; score: number; status: string; jobTitle: string | null }[];
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
    amount: number;
    currency: string;
    stage: string;
    daysInStage: number;
  }[];
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight md:text-2xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function DashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats/dashboard")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats) return <Spinner />;
  const { kpis } = stats;

  return (
    <div className="animate-fade-up space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">Dashboard</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Live view of your pipeline — every number is clickable-deep in Reports.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Open pipeline"
          value={formatCompact(kpis.pipelineValue, "USD")}
          hint={`${kpis.openDeals} open deals`}
        />
        <Kpi
          label="Weighted forecast"
          value={formatCompact(kpis.weightedForecast, "USD")}
          hint="Stage-probability adjusted"
        />
        <Kpi label="Won this month" value={formatCompact(kpis.wonThisMonth, "USD")} />
        <Kpi
          label="Win rate (90d)"
          value={kpis.winRate === null ? "—" : `${kpis.winRate}%`}
          hint={
            kpis.avgCycleDays !== null ? `${kpis.avgCycleDays}d avg sales cycle` : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Won revenue by month</h2>
          <p className="mb-3 text-xs text-ink-muted">USD equivalent, last 6 months</p>
          <MoneyBarChart data={stats.revenueByMonth} xKey="month" yKey="won" />
        </div>
        <div className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Pipeline funnel</h2>
          <p className="mb-3 text-xs text-ink-muted">Open value by stage</p>
          <FunnelChart data={stats.funnel} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">🔥 Hottest leads</h2>
          <div className="space-y-2">
            {stats.hotLeads.map((l) => (
              <Link
                key={l.id}
                href={`/contacts/${l.id}`}
                className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="truncate text-xs text-ink-muted">{l.jobTitle ?? l.status}</p>
                </div>
                <ScoreBadge score={l.score} />
              </Link>
            ))}
            {stats.hotLeads.length === 0 && (
              <p className="text-sm text-ink-muted">Add contacts to see lead scores.</p>
            )}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">
            Tasks due{" "}
            {kpis.overdueTasks > 0 && (
              <span className="chip bg-red-500/10 text-red-500">{kpis.overdueTasks} overdue</span>
            )}
          </h2>
          <div className="space-y-2">
            {stats.dueTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                <p className="min-w-0 truncate text-sm">{t.title}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <PriorityChip priority={t.priority} />
                  <span className={`text-xs ${t.overdue ? "font-semibold text-red-500" : "text-ink-muted"}`}>
                    {formatDate(t.dueDate)}
                  </span>
                </div>
              </div>
            ))}
            {stats.dueTasks.length === 0 && <p className="text-sm text-ink-muted">Nothing due. 🎉</p>}
          </div>
          <Link href="/tasks" className="mt-3 block text-xs font-medium text-accent-600 hover:underline dark:text-accent-400">
            All tasks →
          </Link>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">⚠️ Stale deals</h2>
          <p className="mb-2 text-xs text-ink-muted">In the same stage for 14+ days</p>
          <div className="space-y-2">
            {stats.staleDeals.map((d) => (
              <Link
                key={d.id}
                href={`/deals/${d.id}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-ink-muted">
                    {formatMoney(d.amount, d.currency)} · {d.stage}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-amber-500">
                  {d.daysInStage}d
                </span>
              </Link>
            ))}
            {stats.staleDeals.length === 0 && (
              <p className="text-sm text-ink-muted">No stuck deals. Keep it moving!</p>
            )}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Team activity</h2>
        <p className="mb-3 text-xs text-ink-muted">Touchpoints and record changes per week</p>
        <CountBarChart data={stats.activityByWeek} xKey="week" yKey="count" label="Activities" height={180} />
      </div>
    </div>
  );
}
