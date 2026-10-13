/**
 * Forecast period table (CONTEXT.md): Deals grouped by calendar quarter and
 * year, split into one column per Breakdown field choice, and in the same pass
 * into one column per Owner (by member id, "" for none). Pure — the caller
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
  ownerId?: string | null;
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
  /** Weighted amount per owner id; "" holds deals nobody owns. */
  byOwner: Record<string, number>;
  weighted: number;
  total: number;
  count: number;
};

/**
 * `columns` are the Breakdown field choices. `ownerColumns` are owner ids,
 * largest weighted total first and "" (unassigned) last; the reader names them,
 * so someone who has left keeps their own column.
 */
export type ForecastTable = { columns: string[]; ownerColumns: string[]; rows: ForecastRow[] };

const UNDATED = "undated";

/** The quarter label ("2026-Q4") a timestamp falls in, by UTC calendar. */
export function quarterOf(ts: number): string {
  const at = new Date(ts);
  return `${at.getUTCFullYear()}-Q${Math.floor(at.getUTCMonth() / 3) + 1}`;
}

/** Start (inclusive) and end (exclusive) of a "2026-Q4" quarter, or null. */
export function quarterRange(label: string): { start: number; end: number } | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(label);
  if (!m) return null;
  const year = Number(m[1]);
  const first = (Number(m[2]) - 1) * 3;
  return { start: Date.UTC(year, first, 1), end: Date.UTC(year, first + 3, 1) };
}

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
  const ownerTotals = new Map<string, number>();

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

    const owner = deal.ownerId ?? "";
    ownerTotals.set(owner, (ownerTotals.get(owner) ?? 0) + weighted);
    const share = { column, owner, weighted, total };

    const ts = dateOf(deal, stage.type, options.date);
    if (ts === null) {
      add(rowFor(rows, UNDATED), share);
      continue;
    }
    const year = new Date(ts).getUTCFullYear();
    years.add(year);
    add(rowFor(rows, quarterOf(ts)), share);
    add(rowFor(rows, String(year)), share);
  }

  const ordered: ForecastRow[] = [];
  for (const year of [...years].sort((a, b) => a - b)) {
    for (const quarter of [1, 2, 3, 4]) ordered.push(rowFor(rows, `${year}-Q${quarter}`));
    ordered.push(rowFor(rows, String(year)));
  }
  if (rows.has(UNDATED)) ordered.push(rows.get(UNDATED)!);

  const ownerColumns = [...ownerTotals.entries()]
    .sort(([a, x], [b, y]) => (a === "") !== (b === "") ? (a === "" ? 1 : -1) : y - x || a.localeCompare(b))
    .map(([owner]) => owner);
  for (const row of ordered) {
    for (const c of columns) row.byBreakdown[c] ??= 0;
    for (const o of ownerColumns) row.byOwner[o] ??= 0;
  }
  return { columns, ownerColumns, rows: ordered };
}

function dateOf(deal: ForecastDeal, stageType: string, date: ForecastOptions["date"]): number | null {
  if (date === "close") return stageType === "won" ? (deal.closedAt ?? deal.expectedCloseDate) : deal.expectedCloseDate;
  const value = deal.custom[date.customKey];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowFor(rows: Map<string, ForecastRow>, period: string): ForecastRow {
  let row = rows.get(period);
  if (!row) {
    row = { period, byBreakdown: {}, byOwner: {}, weighted: 0, total: 0, count: 0 };
    rows.set(period, row);
  }
  return row;
}

type Share = { column: string | null; owner: string; weighted: number; total: number };

function add(row: ForecastRow, { column, owner, weighted, total }: Share): void {
  row.weighted += weighted;
  row.total += total;
  row.count += 1;
  if (column !== null) row.byBreakdown[column] = (row.byBreakdown[column] ?? 0) + weighted;
  row.byOwner[owner] = (row.byOwner[owner] ?? 0) + weighted;
}
