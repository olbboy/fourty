import type { TurnPhase } from "./composer-state";

/**
 * Persisted messages → what the panel renders, and which thread it lands on
 * (Phase 4). Pure, so both rules below are testable without a browser.
 *
 * The transcript is read back from storage rather than kept only in memory:
 * that is what makes a reload, a tab switch and an unreachable provider all
 * survivable — the answer is on the record, not in a React state tree.
 */

export type StoredMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[] | null;
  status: "complete" | "pending_confirmation" | "executing" | "rejected";
  createdAt: number;
};

/**
 * One scroller row per message — never one per tool call. A row per call adds a
 * layout boundary every few hundred milliseconds while an answer streams.
 */
export type Item =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string }
  | { kind: "tool"; name: string; ok: boolean }
  | {
      kind: "proposal";
      messageId: string;
      name: string;
      args: Record<string, unknown>;
      resolved?: "approved" | "rejected";
    }
  | { kind: "error"; message: string };

/** Render a stored thread. Empty assistant turns (a bare tool call) show nothing. */
export function toItems(messages: StoredMessage[]): Item[] {
  const items: Item[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      items.push({ kind: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (m.content.trim()) items.push({ kind: "assistant", content: m.content });
    } else if (m.status === "pending_confirmation" && m.toolCalls?.[0]) {
      // A persisted-but-unconfirmed write comes back as a live card: the user
      // left mid-decision, and the decision is still theirs to make.
      const call = m.toolCalls[0];
      items.push({ kind: "proposal", messageId: m.id, name: call.name, args: call.arguments });
    }
  }
  return items;
}

/**
 * What the thread was doing when we last left it.
 *
 * `executing` is the interesting one: a worker that died mid-write leaves it
 * behind with no closing boundary, and the send route refuses new messages
 * until it resolves. Reporting it as an in-flight turn lets the quiet timeout
 * in `composer-state` call it what it is — over — instead of leaving the thread
 * locked forever.
 */
export function turnFrom(messages: StoredMessage[]): TurnPhase {
  const last = messages[messages.length - 1];
  if (!last) return { kind: "idle" };
  if (messages.some((m) => m.status === "pending_confirmation")) {
    return { kind: "awaiting_confirmation" };
  }
  if (last.status === "executing") return { kind: "streaming", lastEventAt: last.createdAt };
  return { kind: "idle" };
}

export type Thread = { id: string; title: string | null; updatedAt: number };

/**
 * Which thread the panel opens, decided **once**, from the loaded list.
 *
 * Re-deriving "the latest" as the list changes swaps the open conversation out
 * from under a live answer the moment the first save adds a row. So the caller
 * calls this once, after the list has arrived, and keeps the answer.
 *
 * `null` is a legitimate result: a record nobody has asked about yet opens on a
 * blank thread, and the first message is what creates the row.
 */
export function resolveThread(threads: Thread[], requested: string | null): string | null {
  if (requested && threads.some((t) => t.id === requested)) return requested;
  if (requested) return null; // a stale ?thread= from another record — start fresh
  const newest = threads.reduce<Thread | null>(
    (best, t) => (best === null || t.updatedAt > best.updatedAt ? t : best),
    null,
  );
  return newest?.id ?? null;
}
