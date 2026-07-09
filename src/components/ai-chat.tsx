"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconX, IconZap, IconArrowRight } from "./icons";
import { useLocale } from "@/lib/i18n/provider";
import { parseSseStream } from "@/lib/ai/sse-client";

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
  | { type: "error"; message: string };

type StoredMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[] | null;
  status: "complete" | "pending_confirmation" | "executing" | "rejected";
};

type Item =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string }
  | { kind: "tool"; name: string; ok: boolean }
  | { kind: "proposal"; messageId: string; name: string; args: Record<string, unknown>; resolved?: "approved" | "rejected" }
  | { kind: "error"; message: string };

type Labels = {
  title: string;
  placeholder: string;
  send: string;
  confirm: string;
  cancel: string;
  proposes: string;
  open: string;
  close: string;
};

const LABELS: Record<"en" | "vi", Labels> = {
  en: { title: "Assistant", placeholder: "Ask about your CRM…", send: "Send", confirm: "Confirm", cancel: "Cancel", proposes: "wants to run", open: "Open assistant", close: "Close" },
  vi: { title: "Trợ lý", placeholder: "Hỏi về CRM của bạn…", send: "Gửi", confirm: "Xác nhận", cancel: "Hủy", proposes: "muốn chạy", open: "Mở trợ lý", close: "Đóng" },
};

export function AiChat({ enabled }: { enabled: boolean }) {
  const locale = useLocale();
  const L = LABELS[locale] ?? LABELS.en;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "awaiting_confirmation">("idle");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [restored, setRestored] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef<string | null>(null);
  convIdRef.current = conversationId;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items, streamingText]);

  // Consume one SSE response, updating state as events arrive.
  const consume = useCallback(async (res: Response) => {
    if (!res.body) return;
    setStatus("streaming");
    let assistant = "";
    for await (const evt of parseSseStream<ServerEvent>(res.body)) {
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
    // Stream closed without a terminal event (e.g. awaiting_confirmation) — flush.
    if (assistant.trim()) {
      setItems((xs) => [...xs, { kind: "assistant", content: assistant }]);
      setStreamingText("");
    }
  }, []);

  const restore = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/chat");
      if (!res.ok) return;
      const data = (await res.json()) as { conversationId: string | null; messages: StoredMessage[] };
      setConversationId(data.conversationId);
      const next: Item[] = [];
      for (const m of data.messages) {
        if (m.role === "user") next.push({ kind: "user", content: m.content });
        else if (m.role === "assistant") {
          if (m.content.trim()) next.push({ kind: "assistant", content: m.content });
        } else if (m.status === "pending_confirmation" && m.toolCalls?.[0]) {
          // RT-F: a persisted-but-unconfirmed write must come back as a live card.
          const c = m.toolCalls[0];
          next.push({ kind: "proposal", messageId: m.id, name: c.name, args: c.arguments });
        }
      }
      setItems(next);
      if (next.some((i) => i.kind === "proposal")) setStatus("awaiting_confirmation");
    } catch {
      /* offline / disabled — start empty */
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
    if (!message || status === "streaming") return;
    setItems((xs) => [...xs, { kind: "user", content: message }]);
    setInput("");
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: convIdRef.current, message }),
    });
    await consume(res);
  }

  async function decide(messageId: string, approve: boolean) {
    setItems((xs) =>
      xs.map((i) =>
        i.kind === "proposal" && i.messageId === messageId ? { ...i, resolved: approve ? "approved" : "rejected" } : i,
      ),
    );
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: convIdRef.current, decision: { messageId, approve } }),
    });
    await consume(res);
  }

  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={L.open}
        className="fixed bottom-20 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-accent-600 text-white shadow-lg transition hover:bg-accent-700 md:bottom-6"
      >
        <IconZap width={18} height={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={L.title}
            className="flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2 font-semibold">
                <IconZap width={16} height={16} className="text-accent-600" />
                {L.title}
              </div>
              <button onClick={() => setOpen(false)} className="btn-ghost !px-2" aria-label={L.close}>
                <IconX width={16} height={16} />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {items.map((item, i) => (
                <ChatItem key={i} item={item} labels={L} onDecide={decide} disabled={status === "streaming"} />
              ))}
              {streamingText && (
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 px-3 py-2 text-sm">{streamingText}</div>
              )}
            </div>

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
                placeholder={L.placeholder}
                aria-label={L.placeholder}
                disabled={status === "streaming"}
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent-400"
              />
              <button
                type="submit"
                disabled={!input.trim() || status === "streaming"}
                className="btn-primary !px-3"
                aria-label={L.send}
              >
                <IconArrowRight width={16} height={16} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ChatItem({
  item,
  labels,
  onDecide,
  disabled,
}: {
  item: Item;
  labels: Labels;
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
    return <div className="max-w-[85%] rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{item.message}</div>;
  }
  // proposal
  return (
    <div className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-sm">
      <p className="mb-2">
        <span className="font-mono font-semibold">{item.name}</span> {labels.proposes}:
      </p>
      <pre className="mb-2 overflow-x-auto rounded bg-surface px-2 py-1 text-xs">{JSON.stringify(item.args, null, 2)}</pre>
      {item.resolved ? (
        <p className="text-xs text-ink-muted">{item.resolved === "approved" ? `✓ ${labels.confirm}` : `✕ ${labels.cancel}`}</p>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => onDecide(item.messageId, true)} disabled={disabled} className="btn-primary !py-1 !text-xs">
            {labels.confirm}
          </button>
          <button onClick={() => onDecide(item.messageId, false)} disabled={disabled} className="btn-ghost !py-1 !text-xs">
            {labels.cancel}
          </button>
        </div>
      )}
    </div>
  );
}
