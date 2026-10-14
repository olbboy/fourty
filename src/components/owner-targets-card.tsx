"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatCompact } from "@/lib/currency";
import { quarterChoices, quarterOf } from "@/lib/forecast";
import { parseAmount } from "@/lib/import-deals";
import { useLocale, useT } from "@/lib/i18n/provider";

type Row = {
  ownerId: string | null;
  name: string | null;
  active: boolean;
  target?: number | null;
  won?: number;
  wonCount: number;
  lostCount: number;
  open?: number;
  weighted?: number;
  attainment?: number | null;
};

/**
 * The owner table of a quarter (D17). Admins type each member's Target in
 * place; it saves when the field is left.
 */
export function OwnerTargetsCard({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();
  const locale = useLocale();
  const quarters = useMemo(() => quarterChoices(Date.now()), []);
  const [period, setPeriod] = useState(() => quarterOf(Date.now()));
  const [data, setData] = useState<{ currency: string; owners: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/stats/owners?period=${period}`).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, [period]);
  useEffect(() => {
    void load();
  }, [load]);

  async function saveTarget(row: Row, raw: string) {
    if (!row.ownerId) return;
    // "1.000.000.000" and "1500.5" both read as people mean them.
    const amount = raw.trim() === "" ? null : (parseAmount(raw) ?? null);
    if (amount !== null && !(amount >= 0)) return;
    if (amount === (row.target ?? null)) return;
    setError(null);
    const res = await fetch("/api/targets", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: row.ownerId, period, amount }),
    }).catch(() => null);
    if (!res?.ok) setError(t("targets.failed"));
    await load();
  }

  if (!data) return null;
  const money = (n: number | undefined | null) => (n === undefined || n === null ? "—" : formatCompact(n, data.currency, locale));
  return (
    <Card size="flush" className="p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">{t("targets.title")}</h2>
        <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t("targets.quarterAria")} size="sm">
          {quarters.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </NativeSelect>
      </div>
      <p className="mb-3 text-xs text-ink-muted">{t("targets.hint", { currency: data.currency })}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-ink-muted">
            <tr>
              {["owner", "target", "won", "attainment", "open", "weighted", "wonLost"].map((h) => (
                <th key={h} className={`px-2 py-1.5 font-semibold ${h === "owner" ? "" : "text-right"}`}>
                  {t(`targets.${h}` as Parameters<typeof t>[0])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.owners.map((row) => (
              <tr key={row.ownerId ?? "none"} className="border-t border-line/60">
                <td className="px-2 py-1.5">{row.ownerId ? (row.name ?? "—") : t("targets.unowned")}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {isAdmin && row.ownerId && row.active && row.target !== undefined ? (
                    <Input
                      key={`${period}-${row.ownerId}-${row.target ?? ""}`}
                      defaultValue={row.target ?? ""}
                      inputMode="decimal"
                      aria-label={t("targets.setAria", { name: row.name ?? "" })}
                      className="ml-auto h-7 w-32 text-right"
                      onBlur={(e) => void saveTarget(row, e.currentTarget.value)}
                    />
                  ) : (
                    money(row.target)
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(row.won)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {row.attainment === undefined || row.attainment === null ? "—" : `${Math.round(row.attainment * 100)}%`}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(row.open)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(row.weighted)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {row.wonCount} / {row.lostCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-feedback-error">
          {error}
        </p>
      )}
    </Card>
  );
}
