/**
 * The composer's state machine (Phase 4). Pure: no React, no fetch, no clock —
 * `now` is passed in, so every transition is a table row in a test.
 *
 * This module exists because the panel's failure modes are all *one state
 * pretending to be another*. Comp AI's write-up is a list of them, and each rule
 * below is one entry on that list:
 *
 * - A provider we cannot reach is `offline` — a fact about us. Calling it
 *   `working` is a claim about the session that is both untrue and
 *   unrecoverable, because the next read fails identically.
 * - A turn that has been quiet for ninety seconds is `ended`, not `working`. A
 *   restarted worker leaves a turn with no closing boundary; treating it as
 *   in-flight locks the thread forever. JSON heartbeats from the live stream
 *   refresh `lastEventAt` so a slow provider is not that silence.
 * - `ended` and `working` both disable the input and mean opposite things: one
 *   is a wait of seconds, the other is permanent and offers a new conversation.
 */

/** Past this with no event, a turn is over. A live turn emits far more often. */
export const QUIET_MS = 90_000;

export type ComposerState =
  /** The user may type. */
  | "ready"
  /** A turn is in flight, or the thread list has not arrived yet. Seconds. */
  | "working"
  /**
   * A proposed write is waiting on the user. Not in this phase's original list
   * of four — but Fourty's agent stops at every write (ADR-015), and the route
   * answers a new message with 409 until the proposal is resolved. Folding this
   * into `working` would tell the user to wait for something that is waiting for
   * them, which is the exact class of lie this module exists to prevent.
   */
  | "confirming"
  /** Over. Permanent for this thread; the panel offers a new conversation. */
  | "ended"
  /** No provider, or we could not reach it. About us, not about the thread. */
  | "offline";

export type TurnPhase =
  | { kind: "idle" }
  /** `lastEventAt` is when this turn last produced anything at all. */
  | { kind: "streaming"; lastEventAt: number }
  | { kind: "awaiting_confirmation" }
  /** The last request never reached the provider. */
  | { kind: "unreachable" };

export type Snapshot = {
  /** Whether this install has an AI provider configured at all. */
  aiEnabled: boolean;
  /**
   * Whether the thread list has arrived. Until it has, sending would create a
   * *second* conversation and then remount onto the real one — which presents
   * to the user as "my history only appears if I refresh".
   */
  threadsLoaded: boolean;
  turn: TurnPhase;
  now: number;
};

export function composerState(s: Snapshot): ComposerState {
  if (!s.aiEnabled) return "offline";
  if (s.turn.kind === "unreachable") return "offline";
  if (!s.threadsLoaded) return "working";
  if (s.turn.kind === "awaiting_confirmation") return "confirming";
  if (s.turn.kind === "streaming") {
    return s.now - s.turn.lastEventAt >= QUIET_MS ? "ended" : "working";
  }
  return "ready";
}

/** Only one state accepts a message. Everything else is a reason it cannot. */
export function canSend(state: ComposerState): boolean {
  return state === "ready";
}

/**
 * A JSON heartbeat proves the stream is still open. It must not reopen a turn
 * that already stopped (`awaiting_confirmation` / idle / unreachable) — a beat
 * can race the closing event.
 */
export function applyHeartbeat(turn: TurnPhase, now: number): TurnPhase {
  if (turn.kind !== "streaming") return turn;
  return { kind: "streaming", lastEventAt: now };
}

/**
 * Whether the panel offers *Start a new conversation*. Only `ended` does: it is
 * the one state a user cannot get out of by waiting or by answering.
 */
export function offersRestart(state: ComposerState): boolean {
  return state === "ended";
}
