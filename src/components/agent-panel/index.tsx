"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseSseStream } from "@/lib/ai/sse-client";
import { timeAgo } from "@/lib/format";
import { useFacts, type RecordFact } from "@/components/fact-suggestion";
import { IconArrowRight } from "@/components/icons";
import { Spinner, LoadError } from "@/components/ui";
import {
  applyHeartbeat,
  canSend,
  composerState,
  offersRestart,
  type ComposerState,
  type TurnPhase,
} from "./composer-state";
import { resolveThread, toItems, turnFrom, type Item, type StoredMessage, type Thread } from "./transcript";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { useLocale, useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import { factBandLabel, factFieldLabel } from "@/lib/fact-display";

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
  | { type: "error"; message: string }
  | { type: "heartbeat" };

export type AgentPanelProps = {
  entityType: string;
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
  const t = useT();

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
  const [listFailed, setListFailed] = useState(false);
  const [listRetry, setListRetry] = useState(0);
  const [transcriptFailed, setTranscriptFailed] = useState(false);
  const [transcriptRetry, setTranscriptRetry] = useState(0);

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
  // Facts only attach to contacts and companies (FACT_ENTITIES). A custom
  // object or deal would 400 `/api/facts` and the panel would render LoadError.
  const showFacts = entityType === "contact" || entityType === "company";
  const { proposed, applied, failed: factsFailed, retry: retryFacts } = useFacts(
    entityType,
    entityId,
    refreshKey,
    opened && showFacts,
  );

  // A new record is a new panel: everything about the old one goes.
  useEffect(() => {
    setThreads(null);
    setThreadId(null);
    setItems([]);
    setStreamingText("");
    setTurn({ kind: "idle" });
    setListFailed(false);
    setTranscriptFailed(false);
    loaded.current = null;
    generation.current += 1;
  }, [entityType, entityId]);

  // Rule 1: load the list first, and rule 2: decide the thread from it exactly
  // once. `params` is deliberately read here and not tracked as a dependency —
  // re-running this on every URL change is the swap-under-a-live-answer bug.
  // A failed GET must not become `[]`: that unlocks the composer and the next
  // send starts a *second* conversation on top of history that never appeared.
  useEffect(() => {
    if (!opened) return;
    let live = true;
    fetch(`/api/ai/conversations?entityType=${entityType}&entityId=${entityId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!live) return;
        const list = (d.conversations ?? []) as Thread[];
        setListFailed(false);
        setThreads(list);
        setThreadId(resolveThread(list, params.get("thread")));
      })
      .catch(() => {
        if (live) setListFailed(true);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see rule 2 above
  }, [opened, entityType, entityId, listRetry]);

  // The transcript of whichever thread we landed on, read back from storage so
  // it survives a reload, a tab switch and a provider that is not answering.
  useEffect(() => {
    if (!threadId || loaded.current === threadId) return;
    let live = true;
    fetch(`/api/ai/conversations/${threadId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!live) return;
        const messages = (d.messages ?? []) as StoredMessage[];
        loaded.current = threadId;
        setTranscriptFailed(false);
        setItems(toItems(messages));
        setTurn(turnFrom(messages));
      })
      .catch(() => {
        if (live) setTranscriptFailed(true);
      });
    return () => {
      live = false;
    };
  }, [threadId, transcriptRetry]);

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
      setTranscriptFailed(false);
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

  const failTurn = useCallback(
    (gen: number) => {
      if (generation.current !== gen) return;
      // A 429/500 is not "no provider". `unreachable` maps to `offline` and
      // locks the composer with no retry; idle + an error row lets them send again.
      setItems((xs) => [...xs, { kind: "error", message: t("chat.unreachable") }]);
      setStreamingText("");
      setTurn({ kind: "idle" });
    },
    [t],
  );

  const consume = useCallback(async (res: Response, gen: number) => {
    const current = () => generation.current === gen;
    if (!res.ok || !res.body) {
      failTurn(gen);
      return;
    }
    if (current()) setTurn({ kind: "streaming", lastEventAt: Date.now() });
    let assistant = "";
    try {
      for await (const evt of parseSseStream<ServerEvent>(res.body)) {
        // Read to the end regardless — an abandoned response still has to be
        // drained — but write nothing into a panel that has moved on.
        if (!current()) continue;
        if (evt.type === "heartbeat") {
          setTurn((s) => applyHeartbeat(s, Date.now()));
          continue;
        }
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
      // The connection dropped mid-answer. Say so and unlock the composer —
      // locking `offline` would make a dropped stream look like no provider.
      failTurn(gen);
      return;
    }
    if (current() && assistant.trim()) {
      setItems((xs) => [...xs, { kind: "assistant", content: assistant }]);
      setStreamingText("");
    }
    // Stream closed without `done` (proxy cut, empty body). Stay confirming
    // if a proposal is up; otherwise unlock — 90s of `working` is a lock.
    if (current()) setTurn((s) => (s.kind === "streaming" ? { kind: "idle" } : s));
  }, [failTurn]);

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
      failTurn(gen);
    }
  }

  async function decide(messageId: string, approve: boolean) {
    // Buttons disable on `working`. Mark the card resolved only after the POST
    // is accepted — a 409/429/500 is not a decision the server stored, and the
    // proposal is still theirs to answer.
    const gen = generation.current;
    setTurn({ kind: "streaming", lastEventAt: Date.now() });
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: threadRef.current, decision: { messageId, approve } }),
      });
      if (!res.ok || !res.body) {
        if (generation.current === gen) setTurn({ kind: "awaiting_confirmation" });
        return;
      }
      setItems((xs) =>
        xs.map((i) =>
          i.kind === "proposal" && i.messageId === messageId
            ? { ...i, resolved: approve ? "approved" : "rejected" }
            : i,
        ),
      );
      await consume(res, gen);
      onChanged();
    } catch {
      if (generation.current === gen) setTurn({ kind: "awaiting_confirmation" });
    }
  }

  return (
    <div hidden={hidden} className="space-y-4">
      {!opened ? null : (
        <>
          {listFailed ? (
            <LoadError compact onRetry={() => setListRetry((n) => n + 1)} />
          ) : threads === null ? (
            <Spinner />
          ) : (
            <>
              <ThreadBar threads={threads} threadId={threadId} onOpen={openThread} />
              {transcriptFailed ? (
                <LoadError compact onRetry={() => setTranscriptRetry((n) => n + 1)} />
              ) : (
                <>
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
            </>
          )}
          {showFacts ? (
            <ResearchFindings
              proposed={proposed}
              applied={applied}
              failed={factsFailed}
              onRetry={retryFacts}
              entityType={entityType}
              onChanged={onChanged}
            />
          ) : null}
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
  const t = useT();
  const locale = useLocale();
  if (threads.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="agent-thread" className="text-xs text-ink-muted">
        {t("agent.conversation")}
      </label>
      <NativeSelect
        id="agent-thread"
        value={threadId ?? ""}
        onChange={(e) => onOpen(e.target.value || null)} size="sm">
        <option value="">{t("agent.newConversation")}</option>
        {threads.map((thread) => (
          <option key={thread.id} value={thread.id}>
            {thread.title ?? t("agent.conversationAgo", { when: timeAgo(thread.updatedAt, locale) })}
          </option>
        ))}
      </NativeSelect>
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
  const t = useT();
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
        <p className="text-sm text-ink-muted">{t("agent.empty")}</p>
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
  const t = useT();
  if (item.kind === "user") {
    // Tinted, not filled — see the note on the same bubble in ai-chat.tsx.
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent-100 px-3 py-2 text-sm text-accent-900">
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
    return <div className="rounded-lg bg-feedback-error-wash px-3 py-2 text-sm text-feedback-error">{item.message}</div>;
  }
  return (
    <div className="rounded-xl border border-feedback-warn/20 bg-feedback-warn-wash p-3 text-sm">
      <p className="mb-2">
        <span className="font-mono font-semibold">{item.name}</span> {t("agent.wantsToRun")}
      </p>
      <pre className="mb-2 overflow-x-auto rounded bg-surface px-2 py-1 text-xs">
        {JSON.stringify(item.args, null, 2)}
      </pre>
      {item.resolved ? (
        <p className="text-xs text-ink-muted">
          {item.resolved === "approved" ? t("agent.confirmed") : t("agent.cancelled")}
        </p>
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={() => onDecide(item.messageId, true)}
            disabled={disabled} size="xs">
            {t("action.confirm")}
          </Button>
          <Button
            onClick={() => onDecide(item.messageId, false)}
            disabled={disabled} variant="outline" size="xs">
            {t("action.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────

/** What each state tells the user. Every line is true of that state and no other. */
const PLACEHOLDER_KEYS: Record<ComposerState, MessageKey> = {
  ready: "agent.placeholder.ready",
  working: "agent.placeholder.working",
  confirming: "agent.placeholder.confirming",
  ended: "agent.placeholder.ended",
  offline: "agent.placeholder.offline",
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
  const t = useT();
  return (
    <div className="space-y-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(PLACEHOLDER_KEYS[state])}
          aria-label={t("agent.askAria")}
          disabled={!canSend(state)} />
        <Button
          type="submit"
          disabled={!canSend(state) || !value.trim()}
          aria-label={t("action.send")} className="px-3">
          <IconArrowRight width={16} height={16} />
        </Button>
      </form>
      {offersRestart(state) && (
        <Button onClick={onRestart} variant="outline" size="xs">
          {t("agent.restart")}
        </Button>
      )}
      {state === "offline" && (
        <p className="text-xs text-ink-muted">{t("agent.offlineHint")}</p>
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
  failed,
  onRetry,
  entityType,
  onChanged,
}: {
  proposed: RecordFact[];
  applied: RecordFact[];
  failed: boolean;
  onRetry: () => void;
  entityType: string;
  onChanged: () => void;
}) {
  const t = useT();
  if (failed) {
    return (
      <div className="border-t border-line pt-3">
        <LoadError compact onRetry={onRetry} />
      </div>
    );
  }
  const research = applied.filter((f) => f.method === "research");
  if (proposed.length === 0 && research.length === 0) {
    return (
      <p className="border-t border-line pt-3 text-xs text-ink-muted">
        {t("agent.researchEmpty", { entityType })}
      </p>
    );
  }
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {t("agent.researchTitle")}
      </h3>
      {[...proposed, ...research].map((f) => (
        <div key={f.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <p>
            <span className="font-medium">{factFieldLabel(f.field, t)}</span>: {f.value}
            <span className="ml-2 text-xs text-ink-muted">
              {f.status === "APPLIED" ? t("agent.filledIn") : t("agent.suggested")} · {factBandLabel(f.band, t)}
            </span>
          </p>
          {f.evidence[0] && <p className="mt-0.5 text-xs text-ink-muted">{f.evidence[0].detail}</p>}
        </div>
      ))}
      <p className="text-xs text-ink-muted">
        {t("agent.researchHint")}{" "}
        <button onClick={onChanged} className="underline">
          {t("agent.refresh")}
        </button>
      </p>
    </div>
  );
}
