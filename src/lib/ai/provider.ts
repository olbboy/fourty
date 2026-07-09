/**
 * BYO OpenAI-compatible LLM client for the in-app AI agent. Hand-rolled `fetch`
 * — no SDK, no new runtime dependency. One request shape (`/chat/completions`,
 * `stream: true`) covers OpenAI / Groq / OpenRouter and, best-effort, local
 * Ollama / LM Studio. AI is optional: an unset `AI_API_KEY` disables the whole
 * feature (route + UI), so `docker compose up` is unchanged.
 *
 * `streamChat` is a standalone exported function (not a class/singleton) so the
 * agent receives it by injection and tests never stub global `fetch` at the
 * agent layer — its own SSE parsing is covered here in tests/ai-provider.test.ts.
 */

// ── Config (read at call time so tests can tune env) ─────────────────────────

/** AI is enabled only when a key is present. Gates the route + UI. */
export function isAiEnabled(): boolean {
  return !!process.env.AI_API_KEY;
}

function config() {
  return {
    baseUrl: (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
    apiKey: process.env.AI_API_KEY ?? "",
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
    // max_tokens is mandatory — an uncapped completion is unbounded spend.
    maxTokens: Number(process.env.AI_MAX_TOKENS ?? 1024),
  };
}

// ── Provider wire shapes (OpenAI chat-completions) ───────────────────────────

export type ProviderMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ProviderToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ProviderToolCall = {
  id: string;
  type?: "function";
  function: { name: string; arguments: string };
};

export type ProviderTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

// ── Events yielded by streamChat ─────────────────────────────────────────────

/** A fully reconstructed tool call the model wants to run (args parsed to JSON). */
export type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_calls"; calls: ToolCall[] }
  | { type: "done"; finishReason: string };

export type StreamChatArgs = { messages: ProviderMessage[]; tools?: ProviderTool[] };

/** The injectable provider contract the agent depends on. */
export type StreamChat = (args: StreamChatArgs) => AsyncGenerator<StreamEvent, void, unknown>;

/**
 * Raised when the upstream provider errors. `detail` may carry the raw upstream
 * body (which for a self-hosted AI_BASE_URL can leak internal host/port) — it is
 * for server-side logs ONLY and must never be streamed or persisted (RT-I).
 */
export class ProviderError extends Error {
  readonly detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = "ProviderError";
    this.detail = detail;
  }
}

/**
 * POST one chat completion and stream it back as normalized events: text deltas
 * inline, then a single `tool_calls` event (if the model called any tool) with
 * every fragment reassembled, then `done`.
 */
export async function* streamChat(
  args: StreamChatArgs,
): AsyncGenerator<StreamEvent, void, unknown> {
  const { baseUrl, apiKey, model, maxTokens } = config();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: args.messages,
      ...(args.tools?.length ? { tools: args.tools, tool_choice: "auto" } : {}),
      stream: true,
      max_tokens: maxTokens, // RT-E — never send an uncapped completion.
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new ProviderError(`provider responded ${res.status}`, detail);
  }
  yield* parseCompletionStream(res.body);
}

/**
 * Parse an OpenAI-style SSE completion body into StreamEvents.
 *
 * The hard part (R1): a tool call's `function.arguments` arrives as fragments
 * across many chunks, keyed by `index`; providers differ on chunk boundaries and
 * may interleave two calls (index 0 and 1). We accumulate by index and only
 * JSON.parse the assembled arguments once the stream ends, so partial JSON never
 * throws. Malformed event lines and heartbeats are skipped, not fatal.
 */
async function* parseCompletionStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const acc = new Map<number, { id: string; name: string; args: string }>();
  let finishReason = "stop";

  const consume = (block: string): StreamEvent[] => {
    const out: StreamEvent[] = [];
    for (const line of block.split("\n")) {
      const trimmed = line.replace(/^\s+/, "");
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let evt: {
        choices?: {
          delta?: {
            content?: string;
            tool_calls?: {
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
          finish_reason?: string | null;
        }[];
      };
      try {
        evt = JSON.parse(data);
      } catch {
        continue; // a malformed line must not crash the generator
      }
      const choice = evt.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string" && delta.content.length) {
        out.push({ type: "text", delta: delta.content });
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const i = typeof tc.index === "number" ? tc.index : 0;
          const cur = acc.get(i) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (typeof tc.function?.arguments === "string") cur.args += tc.function.arguments;
          acc.set(i, cur);
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    return out;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const e of consume(block)) yield e;
    }
  }
  // Flush any trailing block that did not end in a blank line.
  if (buffer.trim()) for (const e of consume(buffer)) yield e;

  if (acc.size) {
    const calls: ToolCall[] = [...acc.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, tc]) => ({ id: tc.id, name: tc.name, arguments: parseArgs(tc.args) }));
    yield { type: "tool_calls", calls };
  }
  yield { type: "done", finishReason };
}

/** Empty args (`""`) mean no arguments → `{}`; malformed args degrade to `{}`. */
function parseArgs(raw: string): Record<string, unknown> {
  const s = raw.trim();
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
