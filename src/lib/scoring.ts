/**
 * Automatic lead scoring — zero-config, runs on every contact change.
 * Twenty has nothing comparable built in.
 *
 * The score (0-100) blends profile completeness (fit) with engagement
 * (recency + volume of activity). Pure function → easy to test.
 */

export type ScoringInput = {
  hasEmail: boolean;
  hasPhone: boolean;
  hasJobTitle: boolean;
  hasCompany: boolean;
  hasLinkedin: boolean;
  status: string; // lead | qualified | customer | churned
  source?: string | null;
  activityCount30d: number;
  daysSinceLastActivity: number | null; // null = never
  openDealCount: number;
  wonDealCount: number;
};

const SOURCE_WEIGHT: Record<string, number> = {
  referral: 10,
  website: 6,
  event: 5,
  outbound: 3,
  other: 1,
};

export function computeLeadScore(input: ScoringInput): number {
  let score = 0;

  // Fit: how complete/qualified is the profile (max 40)
  if (input.hasEmail) score += 10;
  if (input.hasPhone) score += 6;
  if (input.hasJobTitle) score += 6;
  if (input.hasCompany) score += 10;
  if (input.hasLinkedin) score += 4;
  score += SOURCE_WEIGHT[input.source ?? ""] ?? 0; // max +10 → fit cap ~46

  // Engagement: recency beats volume (max ~40)
  score += Math.min(input.activityCount30d * 4, 20);
  if (input.daysSinceLastActivity !== null) {
    if (input.daysSinceLastActivity <= 3) score += 20;
    else if (input.daysSinceLastActivity <= 7) score += 14;
    else if (input.daysSinceLastActivity <= 30) score += 8;
    else if (input.daysSinceLastActivity <= 90) score += 2;
  }

  // Commercial signals
  score += Math.min(input.openDealCount * 8, 16);
  score += Math.min(input.wonDealCount * 4, 8);

  // Lifecycle adjustments
  if (input.status === "customer") score += 10;
  if (input.status === "churned") score = Math.round(score * 0.3);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreLabel(score: number): "hot" | "warm" | "cold" {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}
