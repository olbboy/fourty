"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconX, IconZap, IconArrowRight } from "./icons";
import { useT } from "@/lib/i18n/provider";
import { parseSseStream } from "@/lib/ai/sse-client";
import { toItems, type Item, type StoredMessage } from "./agent-panel/transcript";
import { LoadError } from "@/components/ui";
import { Button } from "@/components/ui/button";

/**
 * Global AI chat drawer (Phase 4). Consumes the POST-SSE contract: streams
 * assistant text, renders read-tool results compactly, and shows confirm/cancel
 * cards for proposed writes — nothing writes until the user confirms. Restores
 * the active thread on first open, INCLUDING a live confirm card for any
 * pending_confirmation write (RT-F). Rendered only when AI is enabled.
 */

type ServerEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "tool_result"; name: string; ok: boolean; result?: unknown; error?: string }
  | { type: "tool_proposal"; messageId: string; name: string; arguments: Record<string, unknown> }
  | { type: "awaiting_confirmation" }
  | { type: "done"; finishReason: string }
  | { type: "error"; message: string }
  | { type: "heartbeat" };

export function AiChat({ enabled }: { enabled: boolean }) {
  const t = useT();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "awaiting_confirmation">("idle");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [restored, setRestored] = useState(false);
  const [failed, setFailed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef<string | null>(null);
  convIdRef.current = conversationId;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items, streamingText]);

  const failTurn = useCallback(() => {
    setItems((xs) => [...xs, { kind: "error", message: t("chat.unreachable") }]);
    setStreamingText("");
    setStatus("idle");
  }, [t]);

  // Consume one SSE response, updating state as events arrive.
  const consume = useCallback(async (res: Response) => {
    if (!res.ok || !res.body) {
      failTurn();
      return;
    }
    setStatus("streaming");
    let assistant = "";
    try {
      for await (const evt of parseSseStream<ServerEvent>(res.body)) {
        if (evt.type === "heartbeat") continue;
        if (evt.type === "conversation") {
          setConversationId(evt.conversationId);
        } else if (evt.type === "delta") {
          assistant += evt.text;
          setStreamingText(assistant);
        } else if (evt.type === "tool_result") {
          setItems((xs) => [...xs, { kind: "tool", name: evt.name, ok: evt.ok }]);
        } else if (evt.type === "tool_proposal") {
          setItems((xs) => [...xs, { kind: "proposal", messageId: evt.messageId, name: evt.name, args: evt.arguments }]);
        } else if (evt.type === "awaiting_confirmation") {
          if (assistant.trim()) {
            setItems((xs) => [...xs, { kind: "assistant", content: assistant }]);
            assistant = "";
            setStreamingText("");
          }
          setStatus("awaiting_confirmation");
        } else if (evt.type === "error") {
          setItems((xs) => [...xs, { kind: "error", message: evt.message }]);
        } else if (evt.type === "done") {
          if (assistant.trim()) setItems((xs) => [...xs, { kind: "assistant", content: assistant }]);
          assistant = "";
          setStreamingText("");
          setStatus("idle");
        }
      }
    } catch {
      failTurn();
      return;
    }
    // Stream closed without a terminal event (e.g. awaiting_confirmation) — flush.
    if (assistant.trim()) {
      setItems((xs) => [...xs, { kind: "assistant", content: assistant }]);
      setStreamingText("");
    }
    setStatus((s) => (s === "streaming" ? "idle" : s));
  }, [failTurn]);

  const restore = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/ai/chat");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { conversationId: string | null; messages: StoredMessage[] };
      setConversationId(data.conversationId);
      // Shared with the per-record panel: one mapping from stored messages to
      // rows, so a pending write comes back as a live card in both (RT-F).
      const next = toItems(data.messages);
      setItems(next);
      if (next.some((i) => i.kind === "proposal")) setStatus("awaiting_confirmation");
    } catch {
      // A failed GET is not "no thread" — sending now would start a second one
      // on top of history that never appeared.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (open && !restored) {
      setRestored(true);
      void restore();
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, restored, restore]);

  async function send() {
    const message = input.trim();
    // The route answers a new message with 409 until the proposal is resolved —
    // sending now would look like the composer is ready when it is waiting on us.
    if (!message || status !== "idle") return;
    setItems((xs) => [...xs, { kind: "user", content: message }]);
    setInput("");
    // The turn is claimed *before* the request goes out. Waiting for the
    // response to arrive first leaves a window in which the composer is still
    // idle, and a second Enter in that window opens a second conversation.
    setStatus("streaming");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: convIdRef.current, message }),
      });
      await consume(res);
    } catch {
      failTurn();
    }
  }

  async function decide(messageId: string, approve: boolean) {
    // Buttons disable on `streaming`. Mark the card resolved only after the
    // POST is accepted — a 409/429/500 is not a decision the server stored.
    setStatus("streaming");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: convIdRef.current, decision: { messageId, approve } }),
      });
      if (!res.ok || !res.body) {
        failTurn();
        return;
      }
      setItems((xs) =>
        xs.map((i) =>
          i.kind === "proposal" && i.messageId === messageId ? { ...i, resolved: approve ? "approved" : "rejected" } : i,
        ),
      );
      await consume(res);
    } catch {
      failTurn();
    }
  }

  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t("chat.open")}
        className="fixed bottom-20 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-accent-600 md:bottom-6"
      >
        <IconZap width={18} height={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("chat.title")}
            className="flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2 font-semibold">
                <IconZap width={16} height={16} className="text-accent-700" />
                {t("chat.title")}
              </div>
              <Button onClick={() => setOpen(false)} aria-label={t("chat.close")} variant="outline" size="icon-sm">
                <IconX width={16} height={16} />
              </Button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {failed ? (
                <LoadError compact onRetry={() => void restore()} />
              ) : (
                <>
                  {items.map((item, i) => (
                    <ChatItem key={i} item={item} onDecide={decide} disabled={status === "streaming"} />
                  ))}
                  {streamingText && (
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2 text-sm">{streamingText}</div>
                  )}
                </>
              )}
            </div>

            {!failed && (
              <form
                className="flex items-center gap-2 border-t border-line p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    status === "awaiting_confirmation" ? t("agent.placeholder.confirming") : t("chat.placeholder")
                  }
                  aria-label={
                    status === "awaiting_confirmation" ? t("agent.placeholder.confirming") : t("chat.placeholder")
                  }
                  disabled={status !== "idle"}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-400"
                />
                <Button
                  type="submit"
                  disabled={!input.trim() || status !== "idle"}
                  aria-label={t("action.send")} className="px-3">
                  <IconArrowRight width={16} height={16} />
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ChatItem({
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
    // The tinted accent step, not a solid fill: at bubble size a flat brand
    // orange reads like a caution banner and swamps the panel. Same hue, a
    // tenth of the weight. Solid fills stay on small controls.
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-accent-100 px-3 py-2 text-sm text-accent-900">
        {item.content}
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2 text-sm">
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
    return <div className="max-w-[85%] rounded-lg bg-feedback-error-wash px-3 py-2 text-sm text-feedback-error">{item.message}</div>;
  }
  // proposal
  return (
    <div className="rounded-xl border border-feedback-warn/20 bg-feedback-warn-wash p-3 text-sm">
      <p className="mb-2">
        <span className="font-mono font-semibold">{item.name}</span> {t("agent.wantsToRun")}
      </p>
      <pre className="mb-2 overflow-x-auto rounded bg-surface px-2 py-1 text-xs">{JSON.stringify(item.args, null, 2)}</pre>
      {item.resolved ? (
        <p className="text-xs text-ink-muted">
          {item.resolved === "approved" ? t("agent.confirmed") : t("agent.cancelled")}
        </p>
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => onDecide(item.messageId, true)} disabled={disabled} size="xs">
            {t("action.confirm")}
          </Button>
          <Button onClick={() => onDecide(item.messageId, false)} disabled={disabled} variant="outline" size="xs">
            {t("action.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
