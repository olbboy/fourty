"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCompact } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { PageHeader, Spinner } from "@/components/ui";
import { WinLossChart, CategoryBars } from "@/components/charts";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
        <Card size="flush" className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Win / loss by month</h2>
          <p className="mb-3 text-xs text-ink-muted">Closed deal counts, last 6 months</p>
          <WinLossChart data={data.winLoss} />
        </Card>

        <Card size="flush" className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Lead source performance</h2>
          <p className="mb-3 text-xs text-ink-muted">Volume and conversion to customer</p>
          <Table className="min-w-[380px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sourceBreakdown.map((s) => (
                  <TableRow key={s.source}>
                    <TableCell className="font-medium capitalize">{s.source}</TableCell>
                    <TableCell>{s.leads}</TableCell>
                    <TableCell>{s.customers}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-accent-600"
                            style={{ width: `${s.conversion}%` }}
                          />
                        </div>
                        <span className="text-xs text-ink-muted">{s.conversion}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </Card>

        <Card size="flush" className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Lead temperature</h2>
          <p className="mb-3 text-xs text-ink-muted">Auto-scored contact distribution</p>
          <CategoryBars data={data.scoreBands} nameKey="band" valueKey="count" height={150} />
        </Card>

        <Card size="flush" className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Contact lifecycle</h2>
          <p className="mb-3 text-xs text-ink-muted">Contacts by status</p>
          <CategoryBars
            data={data.statusBreakdown.map((s) => ({ ...s, status: s.status[0].toUpperCase() + s.status.slice(1) }))}
            nameKey="status"
            valueKey="count"
            height={150}
          />
        </Card>
      </div>

      <Card size="flush" className="p-4">
        <h2 className="mb-1 text-sm font-semibold">Pipeline aging</h2>
        <p className="mb-3 text-xs text-ink-muted">
          Every open deal, sorted by time in current stage — chase the top of this list.
        </p>
        <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Value (USD)</TableHead>
                <TableHead>Days in stage</TableHead>
                <TableHead>Expected close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.aging.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/deals/${d.id}`} className="font-medium text-accent-700 hover:underline dark:text-accent-400">
                      {d.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink-muted">{d.stage}</TableCell>
                  <TableCell>{formatCompact(d.amountUsd, "USD")}</TableCell>
                  <TableCell>
                    <span className={d.daysInStage > 14 ? "font-semibold text-feedback-warn" : ""}>
                      {d.daysInStage}d
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={d.overdue ? "font-semibold text-feedback-error" : "text-ink-muted"}>
                      {formatDate(d.expectedCloseDate)}
                      {d.overdue && " · overdue"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {data.aging.length === 0 && (
                <TableRow>
                  <TableCell className="text-ink-muted" colSpan={5}>
                    No open deals.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
      </Card>
    </div>
  );
}
