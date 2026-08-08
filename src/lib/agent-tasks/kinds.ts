/**
 * The kinds of work the agent does, and which lane drains each (Phase 2).
 *
 * Two lanes exist because a parse that decides nothing must not queue behind a
 * model call that takes thirty seconds. `direct` is deterministic — parse,
 * derive, fetch — and runs with no AI provider configured at all. `session` is
 * model-backed, and is never scheduled when no provider is configured.
 *
 * A pure catalogue: no database, no I/O, so the lane and budget of a kind can be
 * asserted without a Postgres.
 */

export const LANES = ["direct", "session"] as const;
export type Lane = (typeof LANES)[number];

export type TaskKind =
  | "mailbox.pull"
  | "contact.evidence"
  | "deal.health"
  | "contact.research"
  | "sweep.backfill"
  | "recheck";

export type KindSpec = {
  lane: Lane;
  /** Claimed highest-first. A mailbox pull feeds everything else, so it leads. */
  priority: number;
  /** How many attempts this kind may spend before it retires with an outcome. */
  budget: number;
  /** What it does, in the words the queue shows a human. */
  label: string;
};

export const TASK_KINDS = {
  "mailbox.pull": {
    lane: "direct",
    priority: 900,
    budget: 5,
    label: "Fetch new mail and calendar events",
  },
  "contact.evidence": {
    lane: "direct",
    priority: 500,
    budget: 3,
    label: "Read synced mail for facts about this contact",
  },
  "deal.health": { lane: "direct", priority: 400, budget: 2, label: "Recompute deal health" },
  "contact.research": {
    lane: "session",
    priority: 100,
    budget: 2,
    label: "Research this contact with the assistant",
  },
  "sweep.backfill": {
    lane: "direct",
    priority: 50,
    budget: 2,
    label: "Look at records nobody has looked at",
  },
  "recheck": { lane: "session", priority: 0, budget: 2, label: "Check back on this record" },
} as const satisfies Record<TaskKind, KindSpec>;

export const TASK_KIND_NAMES = Object.keys(TASK_KINDS) as TaskKind[];

export function isTaskKind(value: unknown): value is TaskKind {
  return typeof value === "string" && value in TASK_KINDS;
}

export function laneOf(kind: TaskKind): Lane {
  return TASK_KINDS[kind].lane;
}

/** A session kind needs a model; scheduling one without a provider is a zombie. */
export function needsProvider(kind: TaskKind): boolean {
  return TASK_KINDS[kind].lane === "session";
}
