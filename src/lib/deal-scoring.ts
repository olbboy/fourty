/**
 * Automatic deal health / win-likelihood scoring — zero-config, deterministic,
 * NO LLM (ADR-015, Tier 2). Twenty lists automated scoring as "coming soon";
 * Fourty ships it as a pure, tunable, tested function — the same shape as the
 * contact lead scorer (src/lib/scoring.ts).
 *
 * The score (0-100) anchors on the deal's stage win-probability, then adjusts
 * for momentum (recent activity), stalling (time in the current stage), and an
 * overdue close date. Pure function → trivially testable; no DB access here.
 */

export type DealScoringInput = {
  stageType: string; // open | won | lost
  winProbability: number; // 0-100, from the deal's current stage
  daysInStage: number; // days since the deal entered its current stage
  activityCount30d: number;
  daysSinceLastActivity: number | null; // null = never
  isOverdue: boolean; // expectedCloseDate in the past while still open
  hasContact: boolean;
};

export function computeDealScore(input: DealScoringInput): number {
  // Terminal stages are certain — a closed deal's health is not a forecast.
  if (input.stageType === "won") return 100;
  if (input.stageType === "lost") return 0;

  // Base: the stage's inherent win probability (clamped defensively).
  let score = Math.max(0, Math.min(100, input.winProbability));

  // Momentum: recent activity volume (max +12) …
  score += Math.min(input.activityCount30d * 3, 12);
  // … and recency (a warm deal beats a cold one at the same stage).
  if (input.daysSinceLastActivity === null) score -= 12; // never touched
  else if (input.daysSinceLastActivity <= 7) score += 8;
  else if (input.daysSinceLastActivity <= 30) score += 0;
  else if (input.daysSinceLastActivity <= 60) score -= 10;
  else score -= 18;

  // Stalling: sitting too long in the current stage is a risk signal.
  if (input.daysInStage > 90) score -= 16;
  else if (input.daysInStage > 45) score -= 8;

  // Overdue close date on a still-open deal.
  if (input.isOverdue) score -= 15;

  // Weak relationship signal — no primary contact on the deal.
  if (!input.hasContact) score -= 4;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function dealHealthLabel(score: number): "healthy" | "at_risk" | "stalled" {
  if (score >= 66) return "healthy";
  if (score >= 33) return "at_risk";
  return "stalled";
}
