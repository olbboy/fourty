/**
 * Forecast period table (CONTEXT.md): Deals grouped by calendar quarter and
 * year, split into one column per Breakdown field choice. Pure — the caller
 * loads deals and stages and supplies the Reporting currency conversion.
 *
 * Open deals count at their Stage's win probability, won deals in full at the
 * date they were signed, lost deals not at all. Quarters are read in UTC: a
 * close date picked in the form is stored at local noon and a custom date at
 * UTC midnight, so both land on their calendar day. A deal won in the first
 * hours of a quarter's first day east of UTC can fall into the previous one.
 */

export type ForecastDeal = {
  amount: number;
  currency: string;
  stageId: string;
  expectedCloseDate: number | null;
  closedAt: number | null;
  custom: Record<string, unknown>;
};

export type ForecastStage = { id: string; type: string; winProbability: number };

export type ForecastOptions = {
  /** "close" = Expected close date (signed date once won); otherwise a custom date field (Delivery date). */
  date: "close" | { customKey: string };
  /** The Breakdown field and its choices in display order; null for no split. */
  breakdown: { key: string; values: string[] } | null;
  toReporting: (amount: number, currency: string) => number;
};

export type ForecastRow = {
  /** "2026-Q2", "2026" (year subtotal) or "undated". */
  period: string;
  byBreakdown: Record<string, number>;
  weighted: number;
  total: number;
  count: number;
};

export type ForecastTable = { columns: string[]; rows: ForecastRow[] };

const UNDATED = "undated";

export function forecastByPeriod(
  deals: readonly ForecastDeal[],
  stages: readonly ForecastStage[],
  options: ForecastOptions,
): ForecastTable {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const breakdownKey = options.breakdown?.key ?? null;
  const columns = options.breakdown ? [...options.breakdown.values] : [];
  const rows = new Map<string, ForecastRow>();
  const years = new Set<number>();

  for (const deal of deals) {
    const stage = stageById.get(deal.stageId);
    if (!stage || stage.type === "lost") continue;
    const probability = stage.type === "won" ? 100 : stage.winProbability;
    const total = options.toReporting(deal.amount, deal.currency);
    const weighted = (total * probability) / 100;

    let column: string | null = null;
    if (breakdownKey) {
      const value = deal.custom[breakdownKey];
      column = typeof value === "string" ? value : "";
      if (!columns.includes(column)) columns.push(column);
    }

    const ts = dateOf(deal, stage.type, options.date);
    if (ts === null) {
      add(rowFor(rows, UNDATED), column, weighted, total);
      continue;
    }
    const at = new Date(ts);
    const year = at.getUTCFullYear();
    years.add(year);
    add(rowFor(rows, `${year}-Q${Math.floor(at.getUTCMonth() / 3) + 1}`), column, weighted, total);
    add(rowFor(rows, String(year)), column, weighted, total);
  }

  const ordered: ForecastRow[] = [];
  for (const year of [...years].sort((a, b) => a - b)) {
    for (const quarter of [1, 2, 3, 4]) ordered.push(rowFor(rows, `${year}-Q${quarter}`));
    ordered.push(rowFor(rows, String(year)));
  }
  if (rows.has(UNDATED)) ordered.push(rows.get(UNDATED)!);

  for (const row of ordered) for (const c of columns) row.byBreakdown[c] ??= 0;
  return { columns, rows: ordered };
}

function dateOf(deal: ForecastDeal, stageType: string, date: ForecastOptions["date"]): number | null {
  if (date === "close") return stageType === "won" ? (deal.closedAt ?? deal.expectedCloseDate) : deal.expectedCloseDate;
  const value = deal.custom[date.customKey];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowFor(rows: Map<string, ForecastRow>, period: string): ForecastRow {
  let row = rows.get(period);
  if (!row) {
    row = { period, byBreakdown: {}, weighted: 0, total: 0, count: 0 };
    rows.set(period, row);
  }
  return row;
}

function add(row: ForecastRow, column: string | null, weighted: number, total: number): void {
  row.weighted += weighted;
  row.total += total;
  row.count += 1;
  if (column !== null) row.byBreakdown[column] = (row.byBreakdown[column] ?? 0) + weighted;
}
