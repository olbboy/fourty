import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";
import { db, tables, withWorkspace } from "@/db";
import { sha256 } from "@/lib/auth";
import { newId } from "@/lib/id";
import { __resetRateLimits } from "@/lib/ratelimit";
import type { SseEvent } from "@/lib/ai/agent";
import * as route from "@/app/api/ai/chat/route";

/**
 * POST /api/ai/chat end-to-end (Phase 3): real route → agent → real provider
 * parsing, with global fetch stubbed to canned SSE. Asserts the stream shape +
 * persistence, the disabled path (unset key → 404), the pending guard (409, RT-F),
 * and the per-user AI quota (429, RT-E).
 */

const KEY = "frty_ai_test_key";
const KEY_B = "frty_ai_test_key_b"; // a second API key in the SAME workspace (RT-C)

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
const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

function stubProvider(chunks: string[]) {
  globalThis.fetch = vi.fn(async () => ({ ok: true, body: streamFrom(chunks), text: async () => "" }) as unknown as Response) as unknown as typeof fetch;
}

function post(body: unknown, key = KEY): Request {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(query = "", key = KEY): Request {
  return new Request(`http://localhost/api/ai/chat${query}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });
}

async function readSse(res: Response): Promise<SseEvent[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((b) => b.trim())
    .map((b) => JSON.parse(b.replace(/^data:\s*/, "")));
}

const originalFetch = globalThis.fetch;
let ws: string;

describe("POST /api/ai/chat", () => {
  beforeAll(async () => {
    await resetDb();
    ws = await createWorkspace({ name: "Alpha" });
    await withWorkspace(ws, () =>
      db.insert(tables.apiKeys).values([
        { id: newId(), workspaceId: ws, name: "ai", prefix: "frty", keyHash: sha256(KEY), role: "admin", createdAt: Date.now() },
        { id: newId(), workspaceId: ws, name: "ai-b", prefix: "frty", keyHash: sha256(KEY_B), role: "admin", createdAt: Date.now() },
      ]),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    __resetRateLimits();
    delete process.env.AI_RATELIMIT_PER_HOUR;
  });

  afterAll(() => {
    delete process.env.AI_API_KEY;
  });

  it("returns 404 when AI is disabled (key unset)", async () => {
    delete process.env.AI_API_KEY;
    const res = await route.POST(post({ message: "hi" }));
    expect(res.status).toBe(404);
  });

  it("streams text/event-stream and persists the turn", async () => {
    process.env.AI_API_KEY = "sk-test";
    stubProvider([
      sse({ choices: [{ delta: { content: "Hi" } }] }),
      sse({ choices: [{ delta: { content: " there" } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      "data: [DONE]\n\n",
    ]);
    const res = await route.POST(post({ message: "hello" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const events = await readSse(res);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("conversation");
    expect(events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("")).toBe("Hi there");
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "stop" });

    const conversationId = (events[0] as { conversationId: string }).conversationId;
    const msgs = await withWorkspace(ws, () =>
      db.select().from(tables.aiMessages).where(eq(tables.aiMessages.conversationId, conversationId)),
    );
    expect(msgs.map((m) => m.role).sort()).toEqual(["assistant", "user"]);
  });

  it("rejects a new message while a write is pending with 409 (RT-F)", async () => {
    process.env.AI_API_KEY = "sk-test";
    // First turn proposes a write → conversation left awaiting confirmation.
    stubProvider([
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "w1", function: { name: "create_contact", arguments: '{"firstName":"Ada"}' } }] } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
    ]);
    const first = await readSse(await route.POST(post({ message: "add Ada" })));
    expect(first.some((e) => e.type === "awaiting_confirmation")).toBe(true);
    const conversationId = (first[0] as { conversationId: string }).conversationId;

    // A new message on the same thread must be blocked until the write resolves.
    const res = await route.POST(post({ conversationId, message: "and another" }));
    expect(res.status).toBe(409);
  });

  it("enforces the per-user AI quota with 429 (RT-E)", async () => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_RATELIMIT_PER_HOUR = "1";
    __resetRateLimits();
    stubProvider([sse({ choices: [{ delta: { content: "ok" } }] }), sse({ choices: [{ delta: {}, finish_reason: "stop" }] })]);
    const first = await route.POST(post({ message: "one" }));
    await first.text(); // drain
    expect(first.status).toBe(200);

    const second = await route.POST(post({ message: "two" }));
    expect(second.status).toBe(429);
  });

  it("does not let the message quota block a confirm/reject decision (M3)", async () => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_RATELIMIT_PER_HOUR = "1";
    __resetRateLimits();
    // The one allowed message turn proposes a write.
    stubProvider([
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "w1", function: { name: "create_contact", arguments: '{"firstName":"Ada"}' } }] } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
    ]);
    const first = await readSse(await route.POST(post({ message: "add Ada" })));
    const conversationId = (first[0] as { conversationId: string }).conversationId;
    const messageId = (first.find((e) => e.type === "tool_proposal") as { messageId: string }).messageId;

    // Quota is now exhausted, but a decision must still be accepted (never 429).
    const decision = await route.POST(post({ conversationId, decision: { messageId, approve: false } }));
    expect(decision.status).toBe(200);
  });

  it("isolates AI threads between two API keys in the same workspace (RT-C)", async () => {
    process.env.AI_API_KEY = "sk-test";
    __resetRateLimits();
    // Key A opens a thread and leaves a write pending.
    stubProvider([
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "w1", function: { name: "create_contact", arguments: '{"firstName":"Ada"}' } }] } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
    ]);
    const a = await readSse(await route.POST(post({ message: "add Ada" }, KEY)));
    const convA = (a[0] as { conversationId: string }).conversationId;
    const msgA = (a.find((e) => e.type === "tool_proposal") as { messageId: string }).messageId;

    // Key B (same workspace, different principal) sees nothing of A's thread.
    const bLatest = await (await route.GET(get("", KEY_B))).json();
    expect(bLatest).toEqual({ conversationId: null, messages: [] });
    const bDirect = await (await route.GET(get(`?conversationId=${convA}`, KEY_B))).json();
    expect(bDirect).toEqual({ conversationId: null, messages: [] });

    // Key B cannot confirm A's pending write — the route denies the conversation.
    const bConfirm = await route.POST(post({ conversationId: convA, decision: { messageId: msgA, approve: true } }, KEY_B));
    expect(bConfirm.status).toBe(404);
    // And no contact was created by B's attempt.
    const contacts = await withWorkspace(ws, () => db.select().from(tables.contacts));
    expect(contacts).toHaveLength(0);
  });
});
