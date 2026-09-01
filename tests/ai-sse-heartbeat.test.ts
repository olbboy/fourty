import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encodeSseEvent,
  SSE_HEARTBEAT_EVENT,
  SSE_HEARTBEAT_MS,
  startSseHeartbeat,
} from "@/lib/ai/sse-heartbeat";

/**
 * JSON heartbeats keep a slow provider (GLM TTFB can exceed 90s) from looking
 * like a dead turn. SSE comment pings (`: keep-alive`) are ignored by the
 * client parser; these `data:` events are not.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("encodeSseEvent", () => {
  it("frames a JSON data event the client parser accepts", () => {
    expect(new TextDecoder().decode(encodeSseEvent({ type: "done", finishReason: "stop" }))).toBe(
      'data: {"type":"done","finishReason":"stop"}\n\n',
    );
  });
});

describe("startSseHeartbeat", () => {
  it("emits the first beat after the interval, then repeats, and stop() ends it", () => {
    vi.useFakeTimers();
    const chunks: string[] = [];
    const stop = startSseHeartbeat((chunk) => chunks.push(new TextDecoder().decode(chunk)), 1_000);

    vi.advanceTimersByTime(999);
    expect(chunks).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(chunks).toEqual([new TextDecoder().decode(encodeSseEvent(SSE_HEARTBEAT_EVENT))]);

    vi.advanceTimersByTime(1_000);
    expect(chunks).toHaveLength(2);

    stop();
    vi.advanceTimersByTime(5_000);
    expect(chunks).toHaveLength(2);
  });

  it("defaults to an interval well inside the 90s quiet window", () => {
    expect(SSE_HEARTBEAT_MS).toBeGreaterThan(0);
    expect(SSE_HEARTBEAT_MS).toBeLessThan(90_000);
  });

  it("swallows enqueue errors so a closed stream cannot throw from the timer", () => {
    vi.useFakeTimers();
    const stop = startSseHeartbeat(() => {
      throw new Error("closed");
    }, 100);
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    stop();
  });
});
