import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAiEnabled,
  streamChat,
  ProviderError,
  type StreamEvent,
} from "@/lib/ai/provider";
import { toProviderTools } from "@/lib/ai/tool-bridge";
import { TOOLS } from "@/mcp/tools";

/**
 * Provider SSE parsing (Phase 1, R1) — no DB, no live endpoint. `fetch` is
 * stubbed with a ReadableStream of canned `data:` chunks so we exercise the
 * hardest part: reassembling tool-call argument fragments keyed by index, even
 * interleaved/out-of-order, and staying alive through malformed/heartbeat lines.
 */

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

function mockFetchOk(chunks: string[]) {
  const fn = vi.fn(async () => ({
    ok: true,
    body: streamFrom(chunks),
    text: async () => "",
  }) as unknown as Response);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MAX_TOKENS;
});

describe("isAiEnabled", () => {
  it("reflects AI_API_KEY presence", () => {
    delete process.env.AI_API_KEY;
    expect(isAiEnabled()).toBe(false);
    process.env.AI_API_KEY = "sk-test";
    expect(isAiEnabled()).toBe(true);
  });
});

describe("streamChat SSE parsing", () => {
  it("yields ordered text deltas then done", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockFetchOk([
      sse({ choices: [{ delta: { content: "Hello" } }] }),
      sse({ choices: [{ delta: { content: " world" } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      "data: [DONE]\n\n",
    ]);
    const events = await collect(streamChat({ messages: [{ role: "user", content: "hi" }] }));
    expect(events).toEqual([
      { type: "text", delta: "Hello" },
      { type: "text", delta: " world" },
      { type: "done", finishReason: "stop" },
    ]);
  });

  it("reconstructs a tool call whose arguments are fragmented across chunks", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockFetchOk([
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "create_contact", arguments: '{"firstName":"' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'Ada","last' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'Name":"Lovelace"}' } }] } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
    ]);
    const events = await collect(streamChat({ messages: [{ role: "user", content: "add Ada" }] }));
    expect(events).toEqual([
      { type: "tool_calls", calls: [{ id: "call_1", name: "create_contact", arguments: { firstName: "Ada", lastName: "Lovelace" } }] },
      { type: "done", finishReason: "tool_calls" },
    ]);
  });

  it("reconstructs two concurrent tool calls independently, even out of order", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockFetchOk([
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_a", function: { name: "create_contact", arguments: '{"firstName":' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: 1, id: "call_b", function: { name: "create_company", arguments: '{"name":' } }] } }] }),
      // index 1 completes before index 0 (out of order fragments)
      sse({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '"Acme"}' } }] } }] }),
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"Ada"}' } }] } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
    ]);
    const events = await collect(streamChat({ messages: [{ role: "user", content: "x" }] }));
    const toolEvt = events.find((e) => e.type === "tool_calls");
    expect(toolEvt).toEqual({
      type: "tool_calls",
      calls: [
        { id: "call_a", name: "create_contact", arguments: { firstName: "Ada" } },
        { id: "call_b", name: "create_company", arguments: { name: "Acme" } },
      ],
    });
  });

  it("ignores [DONE], heartbeats, blank lines, and malformed JSON without crashing", async () => {
    process.env.AI_API_KEY = "sk-test";
    mockFetchOk([
      ": ping\n\n",
      "\n\n",
      "data: {not valid json}\n\n",
      sse({ choices: [{ delta: { content: "ok" } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      "data: [DONE]\n\n",
    ]);
    const events = await collect(streamChat({ messages: [{ role: "user", content: "x" }] }));
    expect(events).toEqual([
      { type: "text", delta: "ok" },
      { type: "done", finishReason: "stop" },
    ]);
  });

  it("handles an event split across chunk boundaries", async () => {
    process.env.AI_API_KEY = "sk-test";
    // A single logical event delivered in two TCP-sized pieces.
    mockFetchOk([
      'data: {"choices":[{"delta":{"con',
      'tent":"split"}}]}\n\n',
      sse({ choices: [{ delta: {}, finish_reason: "stop" }] }),
    ]);
    const events = await collect(streamChat({ messages: [{ role: "user", content: "x" }] }));
    expect(events[0]).toEqual({ type: "text", delta: "split" });
  });

  it("always sends max_tokens (RT-E) and treats empty args as {}", async () => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_MAX_TOKENS = "512";
    const fn = mockFetchOk([
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c", function: { name: "get_dashboard_stats", arguments: "" } }] } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
    ]);
    const events = await collect(streamChat({ messages: [{ role: "user", content: "stats" }] }));
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBe(512);
    expect(events.find((e) => e.type === "tool_calls")).toEqual({
      type: "tool_calls",
      calls: [{ id: "c", name: "get_dashboard_stats", arguments: {} }],
    });
  });

  it("throws ProviderError (with server-only detail) on a non-OK response", async () => {
    process.env.AI_API_KEY = "sk-test";
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      body: null,
      text: async () => "internal-host:11434 refused",
    }) as unknown as Response) as unknown as typeof fetch;
    await expect(collect(streamChat({ messages: [{ role: "user", content: "x" }] }))).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});

describe("toProviderTools bridge + mutates flag", () => {
  it("maps every tool to the provider function schema", () => {
    const provider = toProviderTools(TOOLS);
    expect(provider).toHaveLength(TOOLS.length);
    for (const [i, pt] of provider.entries()) {
      expect(pt.type).toBe("function");
      expect(pt.function.name).toBe(TOOLS[i].name);
      expect(pt.function.description).toBe(TOOLS[i].description);
      expect(pt.function.parameters).toBe(TOOLS[i].inputSchema);
    }
  });

  it("flags exactly the write tools as mutating", () => {
    const writes = new Set(["create_contact", "create_company", "create_record"]);
    for (const t of TOOLS) {
      expect(t.mutates).toBe(writes.has(t.name));
    }
    // sanity: all three writes are present
    expect(TOOLS.filter((t) => t.mutates).map((t) => t.name).sort()).toEqual(
      ["create_company", "create_contact", "create_record"],
    );
  });
});
