/**
 * Browser-side SSE reader for the chat stream. The route streams over POST (no
 * EventSource), so the client reads the response body itself. This parser is a
 * pure async generator — no DOM, no fetch — so it is unit-testable: it buffers
 * bytes until a full `\n\n`-delimited event, strips the `data:` prefix, ignores
 * blanks / heartbeats / `[DONE]`, and JSON.parses each event. Bytes may split an
 * event across chunk boundaries; the buffer stitches them back together (R2).
 */
export async function* parseSseStream<T = unknown>(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<T, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const evt = parseEventBlock<T>(buffer.slice(0, sep));
        buffer = buffer.slice(sep + 2);
        if (evt !== undefined) yield evt;
      }
    }
    // A final event not terminated by a blank line (stream closed mid-flush).
    const evt = parseEventBlock<T>(buffer);
    if (evt !== undefined) yield evt;
  } finally {
    reader.releaseLock();
  }
}

/** Extract + JSON.parse the first `data:` payload in an event block, or undefined. */
function parseEventBlock<T>(block: string): T | undefined {
  for (const line of block.split("\n")) {
    const trimmed = line.replace(/^\s+/, "");
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      return JSON.parse(data) as T;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
