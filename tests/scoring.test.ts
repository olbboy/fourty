import { describe, expect, it } from "vitest";
import { computeLeadScore, scoreLabel } from "@/lib/scoring";

const base = {
  hasEmail: false,
  hasPhone: false,
  hasJobTitle: false,
  hasCompany: false,
  hasLinkedin: false,
  status: "lead",
  source: null as string | null,
  activityCount30d: 0,
  daysSinceLastActivity: null as number | null,
  openDealCount: 0,
  wonDealCount: 0,
};

describe("computeLeadScore", () => {
  it("gives an empty profile a low score", () => {
    expect(computeLeadScore(base)).toBeLessThan(10);
  });

  it("rewards complete profiles", () => {
    const score = computeLeadScore({
      ...base,
      hasEmail: true,
      hasPhone: true,
      hasJobTitle: true,
      hasCompany: true,
      hasLinkedin: true,
      source: "referral",
    });
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it("rewards recent engagement more than stale engagement", () => {
    const recent = computeLeadScore({ ...base, activityCount30d: 3, daysSinceLastActivity: 1 });
    const stale = computeLeadScore({ ...base, activityCount30d: 0, daysSinceLastActivity: 80 });
    expect(recent).toBeGreaterThan(stale);
  });

  it("counts open deals as strong commercial signal", () => {
    expect(computeLeadScore({ ...base, openDealCount: 2 })).toBeGreaterThanOrEqual(16);
  });

  it("penalizes churned contacts", () => {
    const active = { ...base, hasEmail: true, hasCompany: true, activityCount30d: 5, daysSinceLastActivity: 1 };
    const churned = computeLeadScore({ ...active, status: "churned" });
    expect(churned).toBeLessThan(computeLeadScore(active) / 2);
  });

  it("clamps to 0-100", () => {
    const max = computeLeadScore({
      ...base,
      hasEmail: true,
      hasPhone: true,
      hasJobTitle: true,
      hasCompany: true,
      hasLinkedin: true,
      status: "customer",
      source: "referral",
      activityCount30d: 50,
      daysSinceLastActivity: 0,
      openDealCount: 10,
      wonDealCount: 10,
    });
    expect(max).toBeLessThanOrEqual(100);
    expect(max).toBeGreaterThanOrEqual(90);
  });

  it("labels bands", () => {
    expect(scoreLabel(80)).toBe("hot");
    expect(scoreLabel(50)).toBe("warm");
    expect(scoreLabel(10)).toBe("cold");
  });
});
