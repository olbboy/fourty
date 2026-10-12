import { describe, expect, it } from "vitest";
import { applyFieldPolicyToDashboard, applyFieldPolicyToReports } from "@/lib/services/stats";
import { isDashboardStatsPayload, isReportStatsPayload } from "@/lib/stats-payload";
import type { FieldPolicy } from "@/lib/field-permissions";

const deny = (...fields: string[]): FieldPolicy => ({
  rules: new Map(fields.map((f) => [`deals.${f}`, { read: false, write: false }])),
});

const dashboard = {
  kpis: {
    pipelineValue: 1,
    weightedForecast: 1,
    wonThisMonth: 1,
    winRate: null,
    avgDealSize: 1,
    avgCycleDays: null,
    openDeals: 1,
    contacts: 0,
    openTasks: 0,
    overdueTasks: 0,
  },
  funnel: [],
  revenueByMonth: [],
  activityByWeek: [],
  hotLeads: [],
  dueTasks: [],
  staleDeals: [
    { id: "d1", name: "Acme", amount: 99, currency: "USD", stage: "Lead", daysInStage: 20, score: 41 },
  ],
} as Parameters<typeof applyFieldPolicyToDashboard>[1];

describe("applyFieldPolicyToDashboard", () => {
  it("keeps health score and stage name when unrestricted", () => {
    const out = applyFieldPolicyToDashboard(null, dashboard);
    expect(out.staleDeals[0]?.score).toBe(41);
    expect(out.staleDeals[0]?.stage).toBe("Lead");
  });

  it("drops score and the derived stage name when those fields are hidden", () => {
    const out = applyFieldPolicyToDashboard(deny("score", "stageId"), dashboard);
    expect("score" in out.staleDeals[0]!).toBe(false);
    expect("stage" in out.staleDeals[0]!).toBe(false);
    expect(out.staleDeals[0]?.name).toBe("Acme");
    expect(out.staleDeals[0]?.daysInStage).toBe(20);
  });
});

describe("applyFieldPolicyToReports", () => {
  const reports = {
    sourceBreakdown: [],
    winLoss: [],
    aging: [
      {
        id: "d1",
        name: "Acme",
        stage: "Lead",
        amountUsd: 99,
        daysInStage: 20,
        expectedCloseDate: null as number | null,
        overdue: false,
        score: 41,
      },
    ],
    scoreBands: [],
    statusBreakdown: [],
  };

  it("does not leak a hidden stageId through the aging stage label", () => {
    const out = applyFieldPolicyToReports(deny("stageId"), reports);
    expect("stage" in out.aging[0]!).toBe(false);
    expect(out.aging[0]?.name).toBe("Acme");
  });

  it("keeps health score when unrestricted and drops it when hidden", () => {
    expect(applyFieldPolicyToReports(null, reports).aging[0]?.score).toBe(41);
    const hidden = applyFieldPolicyToReports(deny("score"), reports);
    expect("score" in hidden.aging[0]!).toBe(false);
  });
});

describe("stats payload guards", () => {
  it("accepts a full dashboard body and rejects an error envelope", () => {
    expect(isDashboardStatsPayload(dashboard)).toBe(true);
    expect(isDashboardStatsPayload({ error: "Rate limit exceeded" })).toBe(false);
    expect(isDashboardStatsPayload({ kpis: { openDeals: 1 } })).toBe(false);
  });

  it("accepts a full reports body and rejects an error envelope", () => {
    expect(
      isReportStatsPayload({
        sourceBreakdown: [],
        winLoss: [],
        aging: [],
        scoreBands: [],
        statusBreakdown: [],
      }),
    ).toBe(true);
    expect(isReportStatsPayload({ error: "Rate limit exceeded" })).toBe(false);
  });
});
