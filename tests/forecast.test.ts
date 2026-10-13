import { describe, expect, it } from "vitest";
import { forecastByPeriod, type ForecastDeal } from "@/lib/forecast";

/**
 * The Forecast period table: open Deals at their Stage probability, won Deals
 * at 100%, lost Deals out; grouped by calendar quarter and year in UTC, split
 * into one column per Breakdown field choice.
 */
const stages = [
  { id: "open40", type: "open", winProbability: 40 },
  { id: "won", type: "won", winProbability: 100 },
  { id: "lost", type: "lost", winProbability: 0 },
];
// A close date picked in the form is stored at local noon; 05:00 UTC is noon in Hanoi.
const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 5);
const MOTIONS = ["Dự án trực tiếp", "Đấu thầu", "Đại lý", "Bán một lần"];

function deal(over: Partial<ForecastDeal>): ForecastDeal {
  return { amount: 0, currency: "VND", stageId: "open40", expectedCloseDate: null, closedAt: null, custom: {}, ...over };
}

const deals: ForecastDeal[] = [
  deal({ amount: 10_000, expectedCloseDate: day(2026, 5, 10), custom: { sales_motion: "Dự án trực tiếp" } }),
  deal({ amount: 20_000, expectedCloseDate: day(2026, 6, 30), custom: { sales_motion: "Đấu thầu" } }),
  deal({ amount: 5_000, stageId: "won", expectedCloseDate: day(2026, 9, 1), closedAt: day(2026, 2, 1), custom: { sales_motion: "Dự án trực tiếp" } }),
  deal({ amount: 99_000, stageId: "lost", expectedCloseDate: day(2026, 5, 1), custom: { sales_motion: "Đấu thầu" } }),
  deal({ amount: 7_000 }),
  deal({ amount: 100, currency: "USD", expectedCloseDate: day(2027, 1, 15), custom: { sales_motion: "Đại lý" } }),
];
const toReporting = (amount: number, currency: string) => (currency === "USD" ? amount * 25_000 : amount);

describe("forecastByPeriod", () => {
  const table = forecastByPeriod(deals, stages, {
    date: "close",
    breakdown: { key: "sales_motion", values: MOTIONS },
    toReporting,
  });
  const row = (period: string) => table.rows.find((r) => r.period === period)!;

  it("keeps every breakdown choice as a column, plus one for deals without a value", () => {
    expect(table.columns).toEqual([...MOTIONS, ""]);
  });

  it("lists the four quarters of each year, a year subtotal after them, then undated deals", () => {
    expect(table.rows.map((r) => r.period)).toEqual([
      "2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4", "2026",
      "2027-Q1", "2027-Q2", "2027-Q3", "2027-Q4", "2027",
      "undated",
    ]);
  });

  it("counts a won deal in full at the date it was signed, and drops a lost one", () => {
    expect(row("2026-Q1")).toMatchObject({ weighted: 5_000, total: 5_000, count: 1 });
    expect(row("2026-Q1").byBreakdown["Dự án trực tiếp"]).toBe(5_000);
  });

  it("weights open deals by their stage and splits them by breakdown choice", () => {
    expect(row("2026-Q2")).toMatchObject({ weighted: 12_000, total: 30_000, count: 2 });
    expect(row("2026-Q2").byBreakdown).toMatchObject({ "Dự án trực tiếp": 4_000, "Đấu thầu": 8_000, "Đại lý": 0 });
    expect(row("2026-Q3")).toMatchObject({ weighted: 0, total: 0, count: 0 });
    expect(row("2026")).toMatchObject({ weighted: 17_000, total: 35_000, count: 3 });
  });

  it("converts each amount into the reporting currency before adding", () => {
    expect(row("2027-Q1")).toMatchObject({ weighted: 1_000_000, total: 2_500_000, count: 1 });
    expect(row("2027")).toMatchObject({ weighted: 1_000_000, total: 2_500_000, count: 1 });
  });

  it("puts a deal without the chosen date in the undated row, under the empty column", () => {
    expect(row("undated")).toMatchObject({ weighted: 2_800, total: 7_000, count: 1 });
    expect(row("undated").byBreakdown[""]).toBe(2_800);
  });

  it("reads the delivery date from the chosen custom field, for won deals too", () => {
    const delivery = forecastByPeriod(
      [
        deal({ amount: 5_000, stageId: "won", closedAt: day(2026, 2, 1), custom: { planned_ship_date: Date.UTC(2026, 9, 1) } }),
        deal({ amount: 10_000, expectedCloseDate: day(2026, 5, 10) }),
      ],
      stages,
      { date: { customKey: "planned_ship_date" }, breakdown: null, toReporting },
    );
    expect(delivery.columns).toEqual([]);
    expect(delivery.rows.map((r) => r.period)).toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4", "2026", "undated"]);
    expect(delivery.rows.find((r) => r.period === "2026-Q4")).toMatchObject({ weighted: 5_000, total: 5_000, count: 1 });
    expect(delivery.rows.find((r) => r.period === "undated")).toMatchObject({ weighted: 4_000, total: 10_000, count: 1 });
  });
});

describe("forecastByPeriod split by owner", () => {
  // DVHai, NVLong, BTDuc (who has left) and one deal nobody owns, all in 2026-Q2 at 40%.
  const owned: ForecastDeal[] = [
    deal({ amount: 10_000, expectedCloseDate: day(2026, 5, 10), ownerId: "binh" }),
    deal({ amount: 20_000, expectedCloseDate: day(2026, 6, 30), ownerId: "dai" }),
    deal({ amount: 30_000, expectedCloseDate: day(2026, 4, 2), ownerId: "bac" }),
    deal({ amount: 5_000, expectedCloseDate: day(2026, 5, 20), ownerId: null }),
  ];
  const table = forecastByPeriod(owned, stages, { date: "close", breakdown: null, toReporting });
  const q2 = table.rows.find((r) => r.period === "2026-Q2")!;

  it("gives every owner a column, largest first, including one who left, with unassigned last", () => {
    expect(table.ownerColumns).toEqual(["bac", "dai", "binh", ""]);
    expect(q2.byOwner).toEqual({ bac: 12_000, dai: 8_000, binh: 4_000, "": 2_000 });
  });

  it("splits exactly the weighted total the quarter shows", () => {
    expect(q2.weighted).toBe(26_000);
    expect(Object.values(q2.byOwner).reduce((sum, v) => sum + v, 0)).toBe(26_000);
    expect(table.rows.find((r) => r.period === "2026")!.byOwner).toEqual(q2.byOwner);
  });
});
