"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCompact } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { PageHeader, Spinner, HealthBadge, LoadError } from "@/components/ui";
import { WinLossChart, CategoryBars } from "@/components/charts";
import { Card } from "@/components/ui/card";
import { isReportStatsPayload } from "@/lib/stats-payload";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLocale, useT } from "@/lib/i18n/provider";

type Reports = {
  sourceBreakdown: { source: string; leads: number; customers: number; conversion: number }[];
  winLoss: { month: string; won: number; lost: number }[];
  aging: {
    id: string;
    name: string;
    stage?: string;
    amountUsd?: number;
    daysInStage: number;
    expectedCloseDate?: number | null;
    overdue?: boolean;
    score?: number;
  }[];
  scoreBands: { band: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
};

export function ReportsClient() {
  const t = useT();
  const locale = useLocale();
  const [data, setData] = useState<Reports | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setData(null);
    fetch("/api/stats/reports")
      .then(async (r) => {
        if (!r.ok) throw new Error("reports");
        const body: unknown = await r.json();
        if (!isReportStatsPayload(body)) throw new Error("reports");
        if (!cancelled) setData(body as Reports);
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
        <PageHeader title={t("nav.reports")} subtitle={t("reports.subtitle")} />
        <LoadError onRetry={() => setRetry((n) => n + 1)} />
      </div>
    );
  }

  if (!data) return <Spinner />;

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader title={t("nav.reports")} subtitle={t("reports.subtitle")} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card size="flush" className="p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("reports.winLoss")}</h2>
          <p className="mb-3 text-xs text-ink-muted">{t("reports.winLossHint")}</p>
          <WinLossChart data={data.winLoss} />
        </Card>

        <Card size="flush" className="p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("reports.source")}</h2>
          <p className="mb-3 text-xs text-ink-muted">{t("reports.sourceHint")}</p>
          <Table className="min-w-[380px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.source")}</TableHead>
                  <TableHead>{t("col.leads")}</TableHead>
                  <TableHead>{t("col.customers")}</TableHead>
                  <TableHead>{t("col.conversion")}</TableHead>
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
          <h2 className="mb-1 text-sm font-semibold">{t("reports.temperature")}</h2>
          <p className="mb-3 text-xs text-ink-muted">{t("reports.temperatureHint")}</p>
          <CategoryBars data={data.scoreBands} nameKey="band" valueKey="count" height={150} />
        </Card>

        <Card size="flush" className="p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("reports.lifecycle")}</h2>
          <p className="mb-3 text-xs text-ink-muted">{t("reports.lifecycleHint")}</p>
          <CategoryBars
            data={data.statusBreakdown.map((s) => ({ ...s, status: s.status[0].toUpperCase() + s.status.slice(1) }))}
            nameKey="status"
            valueKey="count"
            height={150}
          />
        </Card>
      </div>

      <Card size="flush" className="p-4">
        <h2 className="mb-1 text-sm font-semibold">{t("reports.aging")}</h2>
        <p className="mb-3 text-xs text-ink-muted">{t("reports.agingHint")}</p>
        <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.deal")}</TableHead>
                <TableHead>{t("col.stage")}</TableHead>
                <TableHead>{t("col.health")}</TableHead>
                <TableHead>{t("col.valueUsd")}</TableHead>
                <TableHead>{t("col.daysInStage")}</TableHead>
                <TableHead>{t("col.expectedClose")}</TableHead>
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
                  <TableCell className="text-ink-muted">{d.stage ?? "—"}</TableCell>
                  <TableCell>{d.score != null ? <HealthBadge score={d.score} /> : "—"}</TableCell>
                  <TableCell>{d.amountUsd != null ? formatCompact(d.amountUsd, "USD") : "—"}</TableCell>
                  <TableCell>
                    <span className={d.daysInStage > 14 ? "font-semibold text-feedback-warn" : ""}>
                      {t("time.daysShort", { n: d.daysInStage })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={d.overdue ? "font-semibold text-feedback-error" : "text-ink-muted"}>
                      {formatDate(d.expectedCloseDate, locale)}
                      {d.overdue && t("reports.overdueSuffix")}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {data.aging.length === 0 && (
                <TableRow>
                  <TableCell className="text-ink-muted" colSpan={6}>
                    {t("reports.noOpenDeals")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
      </Card>
    </div>
  );
}
