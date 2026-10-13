"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCompact } from "@/lib/currency";
import type { ForecastTable } from "@/lib/forecast";
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
import { NativeSelect } from "@/components/ui/native-select";
import { useOwnerPeople } from "@/components/owner-controls";
import { ownerLabel, type OwnerPerson } from "@/lib/owner-display";

/** Which split the forecast columns show: the Breakdown field, or the Owner. */
type Split = "field" | "owner";

type Reports = {
  /** Reporting currency of every amount below; absent from older servers. */
  currency?: string;
  /** Absent when the role cannot read deal amounts. */
  forecast?: { byClose?: ForecastTable; byDelivery: ForecastTable | null };
  sourceBreakdown: { source: string; leads: number; customers: number; conversion: number }[];
  winLoss: { month: string; won: number; lost: number }[];
  aging: {
    id: string;
    name: string;
    stage?: string;
    amount?: number;
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
  const [split, setSplit] = useState<Split>("field");
  const people = useOwnerPeople();

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
  const currency = data.currency ?? "USD";

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

      {data.forecast && (
        <Card size="flush" className="space-y-6 p-4">
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="forecast-split" className="text-ink-muted">
              {t("reports.forecast.splitBy")}
            </label>
            <NativeSelect id="forecast-split" value={split} onChange={(e) => setSplit(e.target.value as Split)} size="sm">
              <option value="field">{t("reports.forecast.splitField")}</option>
              <option value="owner">{t("field.owner")}</option>
            </NativeSelect>
          </div>
          {data.forecast.byClose && (
            <section>
              <h2 className="mb-1 text-sm font-semibold">{t("reports.forecast.byClose")}</h2>
              <p className="mb-3 text-xs text-ink-muted">{t("reports.forecast.hint", { currency })}</p>
              <ForecastPeriodTable table={data.forecast.byClose} currency={currency} split={split} people={people} />
            </section>
          )}
          <section>
            <h2 className="mb-1 text-sm font-semibold">{t("reports.forecast.byDelivery")}</h2>
            {data.forecast.byDelivery ? (
              <>
                <p className="mb-3 text-xs text-ink-muted">{t("reports.forecast.hint", { currency })}</p>
                <ForecastPeriodTable table={data.forecast.byDelivery} currency={currency} split={split} people={people} />
              </>
            ) : (
              <p className="text-xs text-ink-muted">{t("reports.forecast.deliveryUnset")}</p>
            )}
          </section>
        </Card>
      )}

      <Card size="flush" className="p-4">
        <h2 className="mb-1 text-sm font-semibold">{t("reports.aging")}</h2>
        <p className="mb-3 text-xs text-ink-muted">{t("reports.agingHint")}</p>
        <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.deal")}</TableHead>
                <TableHead>{t("col.stage")}</TableHead>
                <TableHead>{t("col.health")}</TableHead>
                <TableHead>{t("col.valueIn", { currency })}</TableHead>
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
                  <TableCell>{d.amount != null ? formatCompact(d.amount, currency, locale) : "—"}</TableCell>
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

/** One Forecast period table: quarters, a year subtotal after each year, then undated deals. */
function ForecastPeriodTable({
  table,
  currency,
  split,
  people,
}: {
  table: ForecastTable;
  currency: string;
  split: Split;
  people: OwnerPerson[];
}) {
  const t = useT();
  // Owner columns are member ids; someone who left keeps their name, marked.
  const columns = split === "owner" ? (table.ownerColumns ?? []) : table.columns;
  const heading = (column: string) =>
    split === "owner" ? ownerLabel(column || null, people, t) : column || t("reports.forecast.emptyChoice");
  const cell = (row: ForecastTable["rows"][number], column: string) =>
    (split === "owner" ? row.byOwner?.[column] : row.byBreakdown[column]) ?? 0;
  const locale = useLocale();
  const money = (n: number) => formatCompact(n, currency, locale);
  const label = (period: string) => {
    if (period === "undated") return t("reports.forecast.undated");
    const [year, quarter] = period.split("-Q");
    return quarter ? t("reports.forecast.quarter", { q: quarter, year }) : t("reports.forecast.year", { year });
  };
  return (
    <Table className="min-w-[560px]">
      <TableHeader>
        <TableRow>
          <TableHead>{t("reports.forecast.period")}</TableHead>
          {columns.map((column) => (
            <TableHead key={column} className="text-right">
              {heading(column)}
            </TableHead>
          ))}
          <TableHead className="text-right">{t("reports.forecast.weighted")}</TableHead>
          <TableHead className="text-right">{t("reports.forecast.total")}</TableHead>
          <TableHead className="text-right">{t("reports.forecast.count")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.rows.map((row) => {
          const isYear = /^\d{4}$/.test(row.period);
          return (
            <TableRow key={row.period} className={isYear ? "bg-surface-2 font-semibold" : undefined}>
              <TableCell>{label(row.period)}</TableCell>
              {columns.map((column) => (
                <TableCell key={column} className="text-right tabular-nums">
                  {row.count ? money(cell(row, column)) : "—"}
                </TableCell>
              ))}
              <TableCell className="text-right tabular-nums">{row.count ? money(row.weighted) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums text-ink-muted">{row.count ? money(row.total) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{row.count}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
