"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseSseStream } from "@/lib/ai/sse-client";
import { timeAgo } from "@/lib/format";
import { useFacts, type RecordFact } from "@/components/fact-suggestion";
import { IconArrowRight } from "@/components/icons";
import { Spinner } from "@/components/ui";
import {
  canSend,
  composerState,
  offersRestart,
  type ComposerState,
  type TurnPhase,
} from "./composer-state";
import { resolveThread, toItems, turnFrom, type Item, type StoredMessage, type Thread } from "./transcript";

/**
 * The per-record agent panel (Phase 4).
 *
 * A conversation *about this record*, plus what the background pass found here.
 * The global chat drawer is unchanged and stays what it is — this panel answers
 * about one record, and the record travels as a server-verified id rather than
 * as text prepended to what the user typed.
 *
 * Most of what follows is Comp AI's list of ways this breaks, written as code:
 *
 * 1. Nothing renders until the thread list has arrived — otherwise the first
 *    message starts a *second* conversation and then remounts onto the real one,
 *    which presents as "my history only appears if I refresh".
 * 2. The thread is captured **once**. Re-deriving "the latest" as the list
 *    changes swaps the open conversation out from under a live answer the moment
 *    the first save adds a row.
 * 3. The panel is never unmounted by a tab switch — it is hidden. An unmount
 *    aborts the stream and the reply lands with nothing left to receive it.
 * 4. A turn quiet for ninety seconds is over, not working (`composer-state`).
 * 5. An unreachable provider is `offline`, a fact about us — not a claim that
 *    the session is busy.
 * 6. One scroller row per message, never one per tool call.
 * 7. Autoscroll follows the tail only while the reader is already at the bottom.
 *
 * With no AI provider configured the panel is still useful: the composer says so
 * and the research findings below it are exactly what the keyless pass produced.
 */

type ServerEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "tool_result"; name: string; ok: boolean }
  | { type: "tool_proposal"; messageId: string; name: string; arguments: Record<string, unknown> }
  | { type: "awaiting_confirmation" }
  | { type: "done"; finishReason: string }
  | { type: "error"; message: string };

export type AgentPanelProps = {
  entityType: "contact" | "company" | "deal";
  entityId: string;
  aiEnabled: boolean;
  /** The tab is not open. The panel stays mounted and renders hidden. */
  hidden: boolean;
  /** A fact decision changed the record; the page should reload it. */
  onChanged: () => void;
  refreshKey: number;
};

export function AgentPanel({
  entityType,
  entityId,
  aiEnabled,
  hidden,
  onChanged,
  refreshKey,
}: AgentPanelProps) {
  const router = useRouter();
  const params = useSearchParams();

  // Rule 3: opening the tab is what starts the work, and closing it never undoes
  // it. `opened` only ever goes true.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!hidden) setOpened(true);
  }, [hidden]);

  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [turn, setTurn] = useState<TurnPhase>({ kind: "idle" });
  const [input, setInput] = useState("");
  const [tick, setTick] = useState(0);

  const threadRef = useRef<string | null>(null);
  threadRef.current = threadId;
  /**
   * The thread whose transcript is already in `items` — either read back from
   * storage or produced live by the stream. Without it, the conversation the
   * stream just created would immediately be re-read from the server and its
   * half-written answer replaced by whatever had been persisted so far.
   */
  const loaded = useRef<string | null>(null);
  /**
   * Which run the panel is currently showing. A stream outlives the thread it
   * was started for whenever the rep switches conversation — or record, since
   * `/contacts/[id]` re-renders this component rather than remounting it — and a
   * generation that is no longer current must stop writing state. Otherwise an
   * answer about one contact finishes arriving into another contact's panel.
   */
  const generation = useRef(0);

  // Gated on `opened`: the detail page already loads these for the under-field
  // chips, and fetching them again on every record view — for a tab nobody
  // opened — is the "does no work until opened" promise being quietly broken.
  const { proposed, applied } = useFacts(entityType, entityId, refreshKey, opened);

  // A new record is a new panel: everything about the old one goes.
  useEffect(() => {
    setThreads(null);
    setThreadId(null);
    setItems([]);
    setStreamingText("");
    setTurn({ kind: "idle" });
    loaded.current = null;
    generation.current += 1;
  }, [entityType, entityId]);

  // Rule 1: load the list first, and rule 2: decide the thread from it exactly
  // once. `params` is deliberately read here and not tracked as a dependency —
  // re-running this on every URL change is the swap-under-a-live-answer bug.
  useEffect(() => {
    if (!opened) return;
    let live = true;
    fetch(`/api/ai/conversations?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => {
        if (!live) return;
        const list = (d.conversations ?? []) as Thread[];
        setThreads(list);
        setThreadId(resolveThread(list, params.get("thread")));
      })
      .catch(() => {
        if (live) setThreads([]);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see rule 2 above
  }, [opened, entityType, entityId]);

  // The transcript of whichever thread we landed on, read back from storage so
  // it survives a reload, a tab switch and a provider that is not answering.
  useEffect(() => {
    if (!threadId || loaded.current === threadId) return;
    let live = true;
    fetch(`/api/ai/conversations/${threadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d) return;
        const messages = (d.messages ?? []) as StoredMessage[];
        loaded.current = threadId;
        setItems(toItems(messages));
        setTurn(turnFrom(messages));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [threadId]);

  // `ended` is reached by time passing rather than by an event, so the panel has
  // to look again. One tick a second, only while a turn is open.
  useEffect(() => {
    if (turn.kind !== "streaming") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [turn.kind]);

  const state = composerState({
    aiEnabled,
    threadsLoaded: threads !== null,
    turn,
    now: Date.now(),
  });
  void tick; // the interval above is what re-reads the clock

  const openThread = useCallback(
    (id: string | null) => {
      loaded.current = null; // a thread the user chose is read back from storage
      generation.current += 1; // and any answer still arriving is not about it
      setThreadId(id);
      setItems([]);
      setStreamingText("");
      setTurn({ kind: "idle" });
      const next = new URLSearchParams(Array.from(params.entries()));
      if (id) next.set("thread", id);
      else next.delete("thread");
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const consume = useCallback(async (res: Response, gen: number) => {
    const current = () => generation.current === gen;
    if (!res.ok || !res.body) {
      if (current()) setTurn({ kind: "unreachable" });
      return;
    }
    if (current()) setTurn({ kind: "streaming", lastEventAt: Date.now() });
    let assistant = "";
    try {
      for await (const evt of parseSseStream<ServerEvent>(res.body)) {
        // Read to the end regardless — an abandoned response still has to be
        // drained — but write nothing into a panel that has moved on.
        if (!current()) continue;
        setTurn({ kind: "streaming", lastEventAt: Date.now() });
        if (evt.type === "conversation") {
          // This thread's transcript is the one being written right now, so it
          // must not be fetched over the top of a live answer.
          loaded.current = evt.conversationId;
          setThreadId((current) => current ?? evt.conversationId);
        } else if (evt.type === "delta") {
          assistant += evt.text;
          setStreamingText(assistant);
        } else if (evt.type === "tool_result") {
          setItems((xs) => [...xs, { kind: "tool", name: evt.name, ok: evt.ok }]);
        } else if (evt.type === "tool_proposal") {
          setItems((xs) => [
            ...xs,
            { kind: "proposal", messageId: evt.messageId, name: evt.name, args: evt.arguments },
          ]);
        } else if (evt.type === "awaiting_confirmation") {
          if (assistant.trim()) setItems((xs) => [...xs, { kind: "assistant", content: assistant }]);
          assistant = "";
          setStreamingText("");
          setTurn({ kind: "awaiting_confirmation" });
        } else if (evt.type === "error") {
          setItems((xs) => [...xs, { kind: "error", message: evt.message }]);
        } else if (evt.type === "done") {
          if (assistant.trim()) setItems((xs) => [...xs, { kind: "assistant", content: assistant }]);
          assistant = "";
          setStreamingText("");
          setTurn({ kind: "idle" });
        }
      }
    } catch {
      // The connection dropped mid-answer. That is a fact about the transport,
      // so say so rather than leaving the thread looking busy forever.
      if (current()) setTurn({ kind: "unreachable" });
      return;
    }
    if (current() && assistant.trim()) {
      setItems((xs) => [...xs, { kind: "assistant", content: assistant }]);
      setStreamingText("");
    }
  }, []);

  async function send() {
    const message = input.trim();
    if (!message || !canSend(state)) return;
    setItems((xs) => [...xs, { kind: "user", content: message }]);
    setInput("");
    // The turn is claimed *before* the request goes out. Waiting for the
    // response to arrive first leaves a window in which the composer is still
    // `ready`, and a second Enter in that window opens a second conversation.
    const gen = generation.current;
    setTurn({ kind: "streaming", lastEventAt: Date.now() });
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The record goes as an id the server re-resolves under this caller's own
        // workspace and role — never appended to the message text.
        body: JSON.stringify({ conversationId: threadRef.current, message, entityType, entityId }),
      });
      await consume(res, gen);
    } catch {
      if (generation.current === gen) setTurn({ kind: "unreachable" });
    }
  }

  async function decide(messageId: string, approve: boolean) {
    setItems((xs) =>
      xs.map((i) =>
        i.kind === "proposal" && i.messageId === messageId
          ? { ...i, resolved: approve ? "approved" : "rejected" }
          : i,
      ),
    );
    const gen = generation.current;
    setTurn({ kind: "streaming", lastEventAt: Date.now() });
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: threadRef.current, decision: { messageId, approve } }),
      });
      await consume(res, gen);
    } catch {
      if (generation.current === gen) setTurn({ kind: "unreachable" });
    }
    onChanged();
  }

  return (
    <div hidden={hidden} className="space-y-4">
      {!opened ? null : (
        <>
          {threads === null ? (
            <Spinner />
          ) : (
            <>
              <ThreadBar threads={threads} threadId={threadId} onOpen={openThread} />
              <Transcript items={items} streamingText={streamingText} onDecide={decide} state={state} />
              <Composer
                state={state}
                value={input}
                onChange={setInput}
                onSend={send}
                onRestart={() => openThread(null)}
              />
            </>
          )}
          <ResearchFindings
            proposed={proposed}
            applied={applied}
            entityType={entityType}
            onChanged={onChanged}
          />
        </>
      )}
    </div>
  );
}

// ── Threads ──────────────────────────────────────────────────────────────────

function ThreadBar({
  threads,
  threadId,
  onOpen,
}: {
  threads: Thread[];
  threadId: string | null;
  onOpen: (id: string | null) => void;
}) {
  if (threads.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="agent-thread" className="text-xs text-ink-muted">
        Conversation
      </label>
      <select
        id="agent-thread"
        value={threadId ?? ""}
        onChange={(e) => onOpen(e.target.value || null)}
        className="input !w-auto !py-1 text-xs"
      >
        <option value="">New conversation</option>
        {threads.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title ?? `Conversation · ${timeAgo(t.updatedAt)}`}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Transcript ───────────────────────────────────────────────────────────────

function Transcript({
  items,
  streamingText,
  onDecide,
  state,
}: {
  items: Item[];
  streamingText: string;
  onDecide: (messageId: string, approve: boolean) => void;
  state: ComposerState;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Rule 7: follow the tail only while the reader is already at the bottom, and
  // let go the moment they scroll up to read something.
  const atBottom = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [items, streamingText]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className="max-h-[420px] min-h-[120px] space-y-3 overflow-y-auto rounded-lg bg-surface-2/40 p-3"
    >
      {items.length === 0 && !streamingText && (
        <p className="text-sm text-ink-muted">
          Ask about this record — what changed, what to do next, who else is involved.
        </p>
      )}
      {items.map((item, i) => (
        <TranscriptRow
          key={i}
          item={item}
          onDecide={onDecide}
          disabled={state === "working" || state === "offline"}
        />
      ))}
      {streamingText && (
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm">
          {streamingText}
        </div>
      )}
    </div>
  );
}

function TranscriptRow({
  item,
  onDecide,
  disabled,
}: {
  item: Item;
  onDecide: (messageId: string, approve: boolean) => void;
  disabled: boolean;
}) {
  if (item.kind === "user") {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent-600 px-3 py-2 text-sm text-white">
        {item.content}
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-surface px-3 py-2 text-sm">
        {item.content}
      </div>
    );
  }
  if (item.kind === "tool") {
    return (
      <div className="text-xs text-ink-muted">
        {item.ok ? "✓" : "✕"} <span className="font-mono">{item.name}</span>
      </div>
    );
  }
  if (item.kind === "error") {
    return <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{item.message}</div>;
  }
  return (
    <div className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-sm">
      <p className="mb-2">
        <span className="font-mono font-semibold">{item.name}</span> wants to run:
      </p>
      <pre className="mb-2 overflow-x-auto rounded bg-surface px-2 py-1 text-xs">
        {JSON.stringify(item.args, null, 2)}
      </pre>
      {item.resolved ? (
        <p className="text-xs text-ink-muted">{item.resolved === "approved" ? "✓ Confirmed" : "✕ Cancelled"}</p>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => onDecide(item.messageId, true)}
            disabled={disabled}
            className="btn-primary !py-1 !text-xs"
          >
            Confirm
          </button>
          <button
            onClick={() => onDecide(item.messageId, false)}
            disabled={disabled}
            className="btn-ghost !py-1 !text-xs"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────

/** What each state tells the user. Every line is true of that state and no other. */
const PLACEHOLDER: Record<ComposerState, string> = {
  ready: "Ask about this record…",
  working: "Working…",
  confirming: "Answer the proposal above to carry on",
  ended: "This conversation has ended",
  offline: "The assistant is not available",
};

function Composer({
  state,
  value,
  onChange,
  onSend,
  onRestart,
}: {
  state: ComposerState;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={PLACEHOLDER[state]}
          aria-label="Ask about this record"
          disabled={!canSend(state)}
          className="input"
        />
        <button
          type="submit"
          disabled={!canSend(state) || !value.trim()}
          aria-label="Send"
          className="btn-primary !px-3"
        >
          <IconArrowRight width={16} height={16} />
        </button>
      </form>
      {offersRestart(state) && (
        <button onClick={onRestart} className="btn-ghost !py-1 !text-xs">
          Start a new conversation
        </button>
      )}
      {state === "offline" && (
        <p className="text-xs text-ink-muted">
          No AI provider is configured, or it could not be reached. Everything below still works — it is
          produced by the keyless research pass, which needs no model.
        </p>
      )}
    </div>
  );
}

// ── What the background pass found ───────────────────────────────────────────

/**
 * The honest scope of "streaming background operations": a parser has no tokens
 * to stream. What a rep actually wants is *what was found and why*, refreshed
 * when the record reloads — so this is a list, not a socket.
 */
function ResearchFindings({
  proposed,
  applied,
  entityType,
  onChanged,
}: {
  proposed: RecordFact[];
  applied: RecordFact[];
  entityType: string;
  onChanged: () => void;
}) {
  const research = applied.filter((f) => f.method === "research");
  if (proposed.length === 0 && research.length === 0) {
    return (
      <p className="border-t border-line pt-3 text-xs text-ink-muted">
        Nothing found about this {entityType} yet. Connect a mailbox and the research pass fills in what
        it can, with the source shown.
      </p>
    );
  }
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">What research found</h3>
      {[...proposed, ...research].map((f) => (
        <div key={f.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <p>
            <span className="font-medium">{f.field.replace(/_/g, " ")}</span>: {f.value}
            <span className="ml-2 text-xs text-ink-muted">
              {f.status === "APPLIED" ? "filled in" : "suggested"} · {f.band.toLowerCase()}
            </span>
          </p>
          {f.evidence[0] && <p className="mt-0.5 text-xs text-ink-muted">{f.evidence[0].detail}</p>}
        </div>
      ))}
      <p className="text-xs text-ink-muted">
        Accept, dismiss or revert any of these under the field it is about.{" "}
        <button onClick={onChanged} className="underline">
          Refresh
        </button>
      </p>
    </div>
  );
}
