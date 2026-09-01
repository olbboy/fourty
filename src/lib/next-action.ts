import type { MessageKey } from "@/lib/i18n";

/**
 * Rules-based next-best-action (ADR-016, Tier 2). Deterministic, no LLM.
 * First matching rule wins so a rep sees one thing to do, not a list.
 *
 * `null` on a field means the caller cannot see it (field-level redact drops
 * the key). Missing is unknown, not empty — a hidden status is not a lead,
 * a hidden email is not "no email".
 */

export type NextAction = {
  action: MessageKey;
  reason: MessageKey;
  vars?: Record<string, string | number>;
};

export type ContactNextInput = {
  status: string | null;
  hasEmail: boolean | null;
  hasPhone: boolean | null;
  hasCompany: boolean | null;
  daysSinceLastActivity: number | null;
  openDealCount: number;
};

export type DealNextInput = {
  stageType: string | null;
  daysInStage: number;
  daysSinceUpdate: number;
  isOverdue: boolean;
  hasContact: boolean | null;
};

const DAY = 86_400_000;

export function daysSince(ts: number | null | undefined, now = Date.now()): number | null {
  if (ts == null) return null;
  return Math.max(0, Math.floor((now - ts) / DAY));
}

/** `redact()` deletes the key. Missing → unknown, not false. */
export function visibleBool(row: object, key: string): boolean | null {
  return Object.hasOwn(row, key) ? Boolean((row as Record<string, unknown>)[key]) : null;
}

export function nextContactAction(input: ContactNextInput): NextAction {
  if (input.status === "churned") {
    return { action: "nba.contact.churned", reason: "nba.contact.churnedWhy" };
  }
  if (input.hasEmail === false && input.hasPhone === false) {
    return { action: "nba.contact.addReach", reason: "nba.contact.addReachWhy" };
  }
  if (input.hasCompany === false) {
    return { action: "nba.contact.linkCompany", reason: "nba.contact.linkCompanyWhy" };
  }
  if (input.daysSinceLastActivity === null) {
    return { action: "nba.contact.firstTouch", reason: "nba.contact.firstTouchWhy" };
  }
  if (input.daysSinceLastActivity > 14 && input.openDealCount > 0) {
    return {
      action: "nba.contact.followDeal",
      reason: "nba.contact.lastTouchDays",
      vars: { n: input.daysSinceLastActivity },
    };
  }
  if (input.daysSinceLastActivity > 21) {
    return {
      action: "nba.contact.scheduleFollow",
      reason: "nba.contact.lastTouchDays",
      vars: { n: input.daysSinceLastActivity },
    };
  }
  if (input.status === "qualified" && input.openDealCount === 0) {
    return { action: "nba.contact.createDeal", reason: "nba.contact.createDealWhy" };
  }
  if (input.status === "lead") {
    return { action: "nba.contact.qualify", reason: "nba.contact.qualifyWhy" };
  }
  if (input.status === "customer") {
    return { action: "nba.contact.referral", reason: "nba.contact.referralWhy" };
  }
  return { action: "nba.keepWarm", reason: "nba.keepWarmWhy" };
}

export function nextDealAction(input: DealNextInput): NextAction {
  if (input.stageType === "won") {
    return { action: "nba.deal.won", reason: "nba.deal.wonWhy" };
  }
  if (input.stageType === "lost") {
    return { action: "nba.deal.lost", reason: "nba.deal.lostWhy" };
  }
  if (input.hasContact === false) {
    return { action: "nba.deal.linkContact", reason: "nba.deal.linkContactWhy" };
  }
  if (input.isOverdue) {
    return { action: "nba.deal.overdue", reason: "nba.deal.overdueWhy" };
  }
  if (input.daysSinceUpdate > 14) {
    return {
      action: "nba.deal.quiet",
      reason: "nba.deal.quietWhy",
      vars: { n: input.daysSinceUpdate },
    };
  }
  if (input.daysInStage > 45) {
    return { action: "nba.deal.stalled", reason: "nba.deal.stalledWhy", vars: { n: input.daysInStage } };
  }
  if (input.stageType == null) {
    return { action: "nba.keepWarm", reason: "nba.deal.keepWarmWhy" };
  }
  return { action: "nba.deal.advance", reason: "nba.deal.advanceWhy" };
}
