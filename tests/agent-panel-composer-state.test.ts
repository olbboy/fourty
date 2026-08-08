import { describe, expect, it } from "vitest";
import {
  canSend,
  composerState,
  offersRestart,
  QUIET_MS,
  type ComposerState,
  type Snapshot,
} from "@/components/agent-panel/composer-state";

/**
 * The composer state machine (Phase 4), exhaustively.
 *
 * Every case here is one of Comp AI's reported failures stated as an assertion.
 * The ones that matter are the pairs that look alike and are not: `offline` vs
 * `working` (a fact about us vs a claim about the session) and `ended` vs
 * `working` (permanent vs a wait of seconds).
 */

const NOW = 1_800_000_000_000;

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  aiEnabled: true,
  threadsLoaded: true,
  turn: { kind: "idle" },
  now: NOW,
  ...over,
});

describe("composer state", () => {
  const cases: Array<[string, Snapshot, ComposerState]> = [
    ["an idle thread with everything loaded", snapshot(), "ready"],
    ["no provider configured at all", snapshot({ aiEnabled: false }), "offline"],
    [
      "a provider we could not reach",
      snapshot({ turn: { kind: "unreachable" } }),
      "offline",
    ],
    [
      "a thread list still in flight",
      snapshot({ threadsLoaded: false }),
      "working",
    ],
    [
      "a turn that produced something a second ago",
      snapshot({ turn: { kind: "streaming", lastEventAt: NOW - 1_000 } }),
      "working",
    ],
    [
      "a turn quiet for exactly the timeout",
      snapshot({ turn: { kind: "streaming", lastEventAt: NOW - QUIET_MS } }),
      "ended",
    ],
    [
      "a turn quiet for far longer than the timeout",
      snapshot({ turn: { kind: "streaming", lastEventAt: NOW - 10 * QUIET_MS } }),
      "ended",
    ],
    [
      "a proposed write waiting on the user",
      snapshot({ turn: { kind: "awaiting_confirmation" } }),
      "confirming",
    ],
  ];

  it.each(cases)("is %s → %s", (_name, input, expected) => {
    expect(composerState(input)).toBe(expected);
  });

  it("calls an unreachable provider offline even mid-turn", () => {
    // The distinction the panel exists to keep: `working` would be a claim that
    // the session is busy, and the next read would fail identically.
    expect(composerState(snapshot({ turn: { kind: "unreachable" } }))).toBe("offline");
  });

  it("prefers offline over every other reason once the provider is gone", () => {
    expect(
      composerState(snapshot({ aiEnabled: false, threadsLoaded: false, turn: { kind: "awaiting_confirmation" } })),
    ).toBe("offline");
  });
});

describe("what each state allows", () => {
  const states: ComposerState[] = ["ready", "working", "confirming", "ended", "offline"];

  it("accepts a message in exactly one state", () => {
    expect(states.filter(canSend)).toEqual(["ready"]);
  });

  it("offers a fresh conversation in exactly one state", () => {
    // Only `ended` is inescapable: waiting fixes `working`, answering fixes
    // `confirming`, and a provider coming back fixes `offline`.
    expect(states.filter(offersRestart)).toEqual(["ended"]);
  });
});
