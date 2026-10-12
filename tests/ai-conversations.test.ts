import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";
import { db, tables, withWorkspace } from "@/db";
import { sha256 } from "@/lib/auth";
import { newId } from "@/lib/id";
import * as listRoute from "@/app/api/ai/conversations/route";
import * as threadRoute from "@/app/api/ai/conversations/[id]/route";
import * as chatRoute from "@/app/api/ai/chat/route";

/**
 * Per-record conversations against real Postgres (Phase 4).
 *
 * Two claims are load-bearing and only one of them is RLS:
 *
 * 1. **Two reps, one contact, two conversations.** RLS puts a workspace-mate's
 *    thread within reach — the `user_id` predicate is what keeps them out of it.
 *    A test that only proves tenant isolation would pass while this leaks.
 * 2. **The record binding is written server-side.** A caller who names a record
 *    they cannot read gets the same answer as one who names a record that is not
 *    there.
 *
 * The conversation routes are deliberately **not** gated on an AI provider: the
 * transcript has to be readable after the key is gone. `AI_API_KEY` is unset
 * throughout this file, which is what makes that assertion mean something.
 */

const KEY_A = "frty_conv_key_a";
const KEY_B = "frty_conv_key_b"; // a second principal in the SAME workspace

const listReq = (query: string, key = KEY_A) =>
  new Request(`http://localhost/api/ai/conversations${query}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

const threadReq = (id: string, key = KEY_A) =>
  new Request(`http://localhost/api/ai/conversations/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

const chatReq = (body: unknown, key = KEY_A) =>
  new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

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

const originalFetch = globalThis.fetch;
let ws: string;
let contactId: string;
let ticketId: string;

describe("per-record conversations", () => {
  beforeAll(async () => {
    await resetDb();
    ws = await createWorkspace({ name: "Alpha" });
    contactId = newId();
    await withWorkspace(ws, async () => {
      await db.insert(tables.apiKeys).values([
        { id: newId(), workspaceId: ws, name: "a", prefix: "frty", keyHash: sha256(KEY_A), role: "admin", createdAt: Date.now() },
        { id: newId(), workspaceId: ws, name: "b", prefix: "frty", keyHash: sha256(KEY_B), role: "admin", createdAt: Date.now() },
      ]);
      await db.insert(tables.contacts).values({
        id: contactId,
        firstName: "Ada",
        lastName: "Marchetti",
        email: "ada@fernhill.example",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const objectId = newId();
      ticketId = newId();
      const now = Date.now();
      await db.insert(tables.customObjects).values({
        id: objectId,
        apiName: "ticket",
        nameSingular: "Ticket",
        namePlural: "Tickets",
        createdAt: now,
      });
      await db.insert(tables.customObjectFields).values({
        id: newId(),
        objectId,
        key: "title",
        label: "Title",
        type: "text",
        required: 1,
        order: 0,
        createdAt: now,
      });
      await db.insert(tables.customRecords).values({
        id: ticketId,
        objectId,
        data: JSON.stringify({ title: "Orion Ticket" }),
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  /** One turn through the real chat route, with the provider stubbed. */
  async function converse(key: string, body: Record<string, unknown>): Promise<string | null> {
    process.env.AI_API_KEY = "test-key";
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          body: streamFrom([
            `data: ${JSON.stringify({ choices: [{ delta: { content: "Ada is Head of Security." } }] }) }\n\n`,
            "data: [DONE]\n\n",
          ]),
          text: async () => "",
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    try {
      const res = await chatRoute.POST(chatReq(body, key));
      const text = await res.text();
      const event = text
        .split("\n\n")
        .filter((b) => b.trim())
        .map((b) => JSON.parse(b.replace(/^data:\s*/, "")))
        .find((e: { type: string }) => e.type === "conversation");
      return (event as { conversationId?: string } | undefined)?.conversationId ?? null;
    } finally {
      delete process.env.AI_API_KEY;
      globalThis.fetch = originalFetch;
    }
  }

  it("binds a new thread to the record the panel was open on", async () => {
    const id = await converse(KEY_A, {
      message: "who is this?",
      entityType: "contact",
      entityId: contactId,
    });
    expect(id).not.toBeNull();

    const listed = await (await listRoute.GET(listReq(`?entityType=contact&entityId=${contactId}`))).json();
    expect(listed.conversations.map((c: { id: string }) => c.id)).toContain(id);

    const thread = await (await threadRoute.GET(threadReq(id!), { params: Promise.resolve({ id: id! }) })).json();
    expect(thread.conversation.entityType).toBe("contact");
    expect(thread.conversation.entityId).toBe(contactId);
    expect(thread.messages[0].content).toBe("who is this?");
  });

  it("gives two principals two conversations about one contact", async () => {
    const mine = await converse(KEY_A, { message: "mine", entityType: "contact", entityId: contactId });
    const theirs = await converse(KEY_B, { message: "theirs", entityType: "contact", entityId: contactId });
    expect(mine).not.toBe(theirs);

    const a = await (await listRoute.GET(listReq(`?entityType=contact&entityId=${contactId}`, KEY_A))).json();
    const b = await (await listRoute.GET(listReq(`?entityType=contact&entityId=${contactId}`, KEY_B))).json();
    const ids = (r: { conversations: { id: string }[] }) => r.conversations.map((c) => c.id);

    expect(ids(b)).toContain(theirs);
    expect(ids(b)).not.toContain(mine);
    expect(ids(a)).not.toContain(theirs);
  });

  it("answers 404 rather than confirming another principal's thread exists", async () => {
    const mine = await converse(KEY_A, { message: "mine", entityType: "contact", entityId: contactId });
    const res = await threadRoute.GET(threadReq(mine!, KEY_B), { params: Promise.resolve({ id: mine! }) });
    expect(res.status).toBe(404);
  });

  it("refuses a record the caller cannot read, the same way as one that is missing", async () => {
    process.env.AI_API_KEY = "test-key";
    try {
      const res = await chatRoute.POST(
        chatReq({ message: "tell me about this", entityType: "contact", entityId: "no-such-contact" }),
      );
      expect(res.status).toBe(404);
    } finally {
      delete process.env.AI_API_KEY;
    }
  });

  it("reads the transcript back with no AI provider configured at all", async () => {
    const id = await converse(KEY_A, { message: "before the key went away", entityType: "contact", entityId: contactId });
    expect(process.env.AI_API_KEY).toBeUndefined();

    const listed = await listRoute.GET(listReq(`?entityType=contact&entityId=${contactId}`));
    expect(listed.status).toBe(200);
    const thread = await threadRoute.GET(threadReq(id!), { params: Promise.resolve({ id: id! }) });
    expect(thread.status).toBe(200);
    expect((await thread.json()).messages.length).toBeGreaterThan(0);
  });

  it("rejects a list request that names no record", async () => {
    expect((await listRoute.GET(listReq("?entityType=contact"))).status).toBe(400);
    expect((await listRoute.GET(listReq("?entityType=planet&entityId=x"))).status).toBe(400);
  });

  it("rejects a chat that names only one half of the record pair", async () => {
    process.env.AI_API_KEY = "test-key";
    try {
      const res = await chatRoute.POST(chatReq({ message: "hello", entityType: "contact" }));
      expect(res.status).toBe(400);
    } finally {
      delete process.env.AI_API_KEY;
    }
  });

  it("binds a new thread to a custom-object record by apiName", async () => {
    const id = await converse(KEY_A, {
      message: "what is this ticket?",
      entityType: "ticket",
      entityId: ticketId,
    });
    expect(id).not.toBeNull();
    const listed = await (await listRoute.GET(listReq(`?entityType=ticket&entityId=${ticketId}`))).json();
    expect(listed.conversations.map((c: { id: string }) => c.id)).toContain(id);
    const thread = await (await threadRoute.GET(threadReq(id!), { params: Promise.resolve({ id: id! }) })).json();
    expect(thread.conversation.entityType).toBe("ticket");
    expect(thread.conversation.entityId).toBe(ticketId);
  });

  it("answers 404 for a named record of an unknown type", async () => {
    process.env.AI_API_KEY = "test-key";
    try {
      const res = await chatRoute.POST(
        chatReq({ message: "tell me about this", entityType: "planet", entityId: "x" }),
      );
      expect(res.status).toBe(404);
    } finally {
      delete process.env.AI_API_KEY;
    }
  });

  it("still accepts a reject after the bound record is deleted", async () => {
    process.env.AI_API_KEY = "test-key";
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          body: streamFrom([
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "w1", function: { name: "create_contact", arguments: '{"firstName":"Ada"}' } }] } }] }) }\n\n`,
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }) }\n\n`,
          ]),
          text: async () => "",
        }) as unknown as Response,
    ) as unknown as typeof fetch;
    try {
      const first = await chatRoute.POST(
        chatReq({ message: "add Ada", entityType: "ticket", entityId: ticketId }),
      );
      const events = (await first.text())
        .split("\n\n")
        .filter((b) => b.trim())
        .map((b) => JSON.parse(b.replace(/^data:\s*/, "")));
      expect(events.some((e: { type: string }) => e.type === "awaiting_confirmation")).toBe(true);
      const conversationId = (events[0] as { conversationId: string }).conversationId;
      const messageId = (events.find((e: { type: string }) => e.type === "tool_proposal") as { messageId: string })
        .messageId;
      await withWorkspace(ws, () => db.delete(tables.customRecords).where(eq(tables.customRecords.id, ticketId)));
      const decision = await chatRoute.POST(
        chatReq({ conversationId, decision: { messageId, approve: false } }),
      );
      expect(decision.status).toBe(200);

      globalThis.fetch = vi.fn(
        async () =>
          ({
            ok: true,
            body: streamFrom([
              `data: ${JSON.stringify({ choices: [{ delta: { content: "still here" } }] }) }\n\n`,
              "data: [DONE]\n\n",
            ]),
            text: async () => "",
          }) as unknown as Response,
      ) as unknown as typeof fetch;
      const follow = await chatRoute.POST(chatReq({ conversationId, message: "what now?" }));
      expect(follow.status).toBe(200);
    } finally {
      delete process.env.AI_API_KEY;
      globalThis.fetch = originalFetch;
    }
  });
});
