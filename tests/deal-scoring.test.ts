import { describe, it, expect } from "vitest";
import { computeDealScore, dealHealthLabel, type DealScoringInput } from "@/lib/deal-scoring";

/**
 * Deal health scoring (ADR-015, Tier 2) — pure function, deterministic, no LLM.
 * Same test shape as the contact lead scorer (tests/scoring.test.ts).
 */
const base: DealScoringInput = {
  stageType: "open",
  winProbability: 50,
  daysInStage: 0,
  activityCount30d: 0,
  daysSinceLastActivity: null,
  isOverdue: false,
  hasContact: true,
};

describe("computeDealScore", () => {
  it("won is certain (100), lost is 0", () => {
    expect(computeDealScore({ ...base, stageType: "won" })).toBe(100);
    expect(computeDealScore({ ...base, stageType: "lost" })).toBe(0);
    // terminal stages ignore every other signal
    expect(computeDealScore({ ...base, stageType: "won", winProbability: 5, isOverdue: true })).toBe(100);
  });

  it("anchors on stage win-probability, penalizing a never-touched deal", () => {
    // 50 base − 12 (never any activity) = 38
    expect(computeDealScore(base)).toBe(38);
  });

  it("recent activity raises the score", () => {
    // 50 + min(2*3,12)=6 + 8 (touched ≤7d) = 64
    expect(
      computeDealScore({ ...base, activityCount30d: 2, daysSinceLastActivity: 1 }),
    ).toBe(64);
  });

  it("stalling in stage lowers the score", () => {
    // 50 + 0 − 12 (never) − 16 (in stage >90d) = 22
    expect(computeDealScore({ ...base, daysInStage: 100 })).toBe(22);
  });

  it("an overdue open deal is penalized", () => {
    // 50 − 12 (never) − 15 (overdue) = 23
    expect(computeDealScore({ ...base, isOverdue: true })).toBe(23);
  });

  it("a missing primary contact costs a few points", () => {
    // 50 − 12 (never) − 4 (no contact) = 34
    expect(computeDealScore({ ...base, hasContact: false })).toBe(34);
  });

  it("clamps to 0..100", () => {
    // 100 + 12 + 8 = 120 → 100
    expect(
      computeDealScore({ ...base, winProbability: 100, activityCount30d: 10, daysSinceLastActivity: 1 }),
    ).toBe(100);
    // heavy penalties never go below 0
    expect(
      computeDealScore({ ...base, winProbability: 5, daysInStage: 200, daysSinceLastActivity: 400, isOverdue: true, hasContact: false }),
    ).toBe(0);
  });

  it("is deterministic — same input, same score", () => {
    const input = { ...base, activityCount30d: 3, daysSinceLastActivity: 5, daysInStage: 10 };
    expect(computeDealScore(input)).toBe(computeDealScore(input));
  });
});

describe("dealHealthLabel", () => {
  it("bands the score", () => {
    expect(dealHealthLabel(80)).toBe("healthy");
    expect(dealHealthLabel(66)).toBe("healthy");
    expect(dealHealthLabel(65)).toBe("at_risk");
    expect(dealHealthLabel(33)).toBe("at_risk");
    expect(dealHealthLabel(32)).toBe("stalled");
    expect(dealHealthLabel(0)).toBe("stalled");
  });
});
