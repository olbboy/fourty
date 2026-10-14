/**
 * The owner table of a quarter (D17), as a pure function of the deals, the
 * stages and the Targets: per owner, the Target, what was won and lost in
 * the quarter (by the day it closed), what is open with an Expected close
 * date in it, its weighted forecast, and how much of the Target is met.
 * Amounts are in the Reporting currency, by the converter given.
 */

export type OwnerDeal = {
  ownerId: string | null;
  amount: number;
  currency: string;
  stageId: string;
  closedAt: number | null;
  expectedCloseDate: number | null;
};
export type OwnerStage = { id: string; type: string; winProbability: number };
export type OwnerPerson = { id: string; name: string; active: boolean };

export type OwnerRow = {
  /** null for deals nobody owns. */
  ownerId: string | null;
  name: string | null;
  active: boolean;
  target: number | null;
  won: number;
  wonCount: number;
  lostCount: number;
  open: number;
  weighted: number;
  /** won / target, or null without a target. */
  attainment: number | null;
};

export function ownerTable(input: {
  deals: OwnerDeal[];
  stages: OwnerStage[];
  targets: Map<string, number>;
  people: OwnerPerson[];
  range: { start: number; end: number };
  toReporting: (amount: number, currency: string) => number;
}): OwnerRow[] {
  const { deals, stages, targets, people, range, toReporting } = input;
  const stageOf = new Map(stages.map((s) => [s.id, s]));
  const within = (ts: number | null) => ts !== null && ts >= range.start && ts < range.end;
  const rows = new Map<string | null, OwnerRow>();
  const row = (ownerId: string | null): OwnerRow => {
    let r = rows.get(ownerId);
    if (!r) {
      const person = ownerId ? people.find((p) => p.id === ownerId) : undefined;
      r = { ownerId, name: person?.name ?? null, active: person?.active ?? false, target: null, won: 0, wonCount: 0, lostCount: 0, open: 0, weighted: 0, attainment: null };
      rows.set(ownerId, r);
    }
    return r;
  };

  // Every active member has a row, with or without deals this quarter.
  for (const person of people) if (person.active) row(person.id);
  for (const [userId, amount] of targets) row(userId).target = amount;

  for (const deal of deals) {
    const stage = stageOf.get(deal.stageId);
    if (!stage) continue;
    const value = toReporting(deal.amount, deal.currency);
    // A closed deal with no closing day (made before closings were dated)
    // counts by its expected close, as the forecast does.
    const closed = deal.closedAt ?? deal.expectedCloseDate;
    if (stage.type === "won" && within(closed)) {
      const r = row(deal.ownerId);
      r.won += value;
      r.wonCount += 1;
    } else if (stage.type === "lost" && within(closed)) {
      row(deal.ownerId).lostCount += 1;
    } else if (stage.type === "open" && within(deal.expectedCloseDate)) {
      const r = row(deal.ownerId);
      r.open += value;
      r.weighted += (value * stage.winProbability) / 100;
    }
  }
  for (const r of rows.values()) r.attainment = r.target ? r.won / r.target : null;
  // Members by name, then whoever left, then the unowned row.
  return [...rows.values()].sort((a, b) => {
    if (a.ownerId === null || b.ownerId === null) return a.ownerId === null ? 1 : -1;
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}
