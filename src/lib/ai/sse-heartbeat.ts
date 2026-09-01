/**
 * JSON SSE heartbeats for the chat stream. Comment pings (`: keep-alive`) are
 * stripped by the browser parser; a `data: {"type":"heartbeat"}` event is not,
 * so the Agent tab can keep `working` while a slow provider (GLM TTFB) thinks.
 *
 * Interval sits well inside the 90s quiet window (`QUIET_MS`). A truly dead
 * stream still ends: no beat and no real event for 90s → `ended`.
 */

export const SSE_HEARTBEAT_MS = 15_000;
export const SSE_HEARTBEAT_EVENT = { type: "heartbeat" } as const;

export function encodeSseEvent(evt: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(evt)}\n\n`);
}

export function startSseHeartbeat(
  enqueue: (chunk: Uint8Array) => void,
  intervalMs: number = SSE_HEARTBEAT_MS,
): () => void {
  const id = setInterval(() => {
    try {
      enqueue(encodeSseEvent(SSE_HEARTBEAT_EVENT));
    } catch {
      // Controller already closed; the next stop() clears the timer.
    }
  }, intervalMs);
  return () => clearInterval(id);
}
