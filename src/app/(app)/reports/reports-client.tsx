"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCompact } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { PageHeader, Spinner } from "@/components/ui";
import { WinLossChart, CategoryBars } from "@/components/charts";

type Reports = {
  sourceBreakdown: { source: string; leads: number; customers: number; conversion: number }[];
  winLoss: { month: string; won: number; lost: number }[];
  aging: {
    id: string;
    name: string;
    stage: string;
    amountUsd: number;
    daysInStage: number;
    expectedCloseDate: number | null;
    overdue: boolean;
  }[];
  scoreBands: { band: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
};

export function ReportsClient() {
  const [data, setData] = useState<Reports | null>(null);

  useEffect(() => {
    fetch("/api/stats/reports")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <Spinner />;

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        title="Reports"
        subtitle="Pipeline velocity, win/loss, lead sources, and scoring — built in, no BI tool needed."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Win / loss by month</h2>
          <p className="mb-3 text-xs text-ink-muted">Closed deal counts, last 6 months</p>
          <WinLossChart data={data.winLoss} />
        </div>

        <div className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Lead source performance</h2>
          <p className="mb-3 text-xs text-ink-muted">Volume and conversion to customer</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px]">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">Source</th>
                  <th className="th">Leads</th>
                  <th className="th">Customers</th>
                  <th className="th">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {data.sourceBreakdown.map((s) => (
                  <tr key={s.source} className="border-b border-line/60 last:border-0">
                    <td className="td font-medium capitalize">{s.source}</td>
                    <td className="td">{s.leads}</td>
                    <td className="td">{s.customers}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-accent-600"
                            style={{ width: `${s.conversion}%` }}
                          />
                        </div>
                        <span className="text-xs text-ink-muted">{s.conversion}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Lead temperature</h2>
          <p className="mb-3 text-xs text-ink-muted">Auto-scored contact distribution</p>
          <CategoryBars data={data.scoreBands} nameKey="band" valueKey="count" height={150} />
        </div>

        <div className="card p-4">
          <h2 className="mb-1 text-sm font-semibold">Contact lifecycle</h2>
          <p className="mb-3 text-xs text-ink-muted">Contacts by status</p>
          <CategoryBars
            data={data.statusBreakdown.map((s) => ({ ...s, status: s.status[0].toUpperCase() + s.status.slice(1) }))}
            nameKey="status"
            valueKey="count"
            height={150}
          />
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Pipeline aging</h2>
        <p className="mb-3 text-xs text-ink-muted">
          Every open deal, sorted by time in current stage — chase the top of this list.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-line">
              <tr>
                <th className="th">Deal</th>
                <th className="th">Stage</th>
                <th className="th">Value (USD)</th>
                <th className="th">Days in stage</th>
                <th className="th">Expected close</th>
              </tr>
            </thead>
            <tbody>
              {data.aging.map((d) => (
                <tr key={d.id} className="border-b border-line/60 last:border-0">
                  <td className="td">
                    <Link href={`/deals/${d.id}`} className="font-medium text-accent-600 hover:underline dark:text-accent-400">
                      {d.name}
                    </Link>
                  </td>
                  <td className="td text-ink-muted">{d.stage}</td>
                  <td className="td">{formatCompact(d.amountUsd, "USD")}</td>
                  <td className="td">
                    <span className={d.daysInStage > 14 ? "font-semibold text-amber-500" : ""}>
                      {d.daysInStage}d
                    </span>
                  </td>
                  <td className="td">
                    <span className={d.overdue ? "font-semibold text-red-500" : "text-ink-muted"}>
                      {formatDate(d.expectedCloseDate)}
                      {d.overdue && " · overdue"}
                    </span>
                  </td>
                </tr>
              ))}
              {data.aging.length === 0 && (
                <tr>
                  <td className="td text-ink-muted" colSpan={5}>
                    No open deals.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
