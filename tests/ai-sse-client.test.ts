import { describe, expect, it } from "vitest";
import { parseSseStream } from "@/lib/ai/sse-client";

/**
 * The pure client SSE parser (Phase 4, R2). Exercises the framing edge cases the
 * network will actually produce: an event split across chunk boundaries, several
 * events in one chunk, a trailing partial line finished by a later chunk, and
 * blank/heartbeat/[DONE] lines that must be ignored.
 */

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
      else c.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const e of parseSseStream(stream)) out.push(e);
  return out;
}

const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

describe("parseSseStream", () => {
  it("parses one event per chunk", async () => {
    const events = await collect(
      streamFrom([sse({ type: "delta", text: "a" }), sse({ type: "done", finishReason: "stop" })]),
    );
    expect(events).toEqual([
      { type: "delta", text: "a" },
      { type: "done", finishReason: "stop" },
    ]);
  });

  it("stitches an event split across chunk boundaries", async () => {
    const events = await collect(
      streamFrom(['data: {"type":"del', 'ta","text":"hi"}\n\n', sse({ type: "done", finishReason: "stop" })]),
    );
    expect(events).toEqual([
      { type: "delta", text: "hi" },
      { type: "done", finishReason: "stop" },
    ]);
  });

  it("parses multiple events packed into one chunk", async () => {
    const events = await collect(
      streamFrom([sse({ type: "delta", text: "a" }) + sse({ type: "delta", text: "b" }) + sse({ type: "done", finishReason: "stop" })]),
    );
    expect(events.map((e) => (e as { type: string }).type)).toEqual(["delta", "delta", "done"]);
  });

  it("ignores blank lines, heartbeats, and [DONE]", async () => {
    const events = await collect(
      streamFrom(["\n\n", ": keep-alive\n\n", "data: [DONE]\n\n", sse({ type: "done", finishReason: "stop" })]),
    );
    expect(events).toEqual([{ type: "done", finishReason: "stop" }]);
  });

  it("yields a final event not terminated by a blank line", async () => {
    const events = await collect(streamFrom(['data: {"type":"done","finishReason":"stop"}']));
    expect(events).toEqual([{ type: "done", finishReason: "stop" }]);
  });
});
