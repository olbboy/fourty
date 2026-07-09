import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";
import { db, tables, withWorkspace } from "@/db";
import type { ToolContext } from "@/mcp/tools";
import type { StreamChat, StreamEvent } from "@/lib/ai/provider";
import { runAgent, type AgentConfig, type AgentInput, type SseEvent } from "@/lib/ai/agent";

/**
 * The agent loop (Phase 3) against real Postgres, with the provider INJECTED as a
 * scripted fake generator (no fetch stub). Proves the safety invariants: writes
 * are proposed not executed, confirmed writes run once and audit via:'ai' (RT-A/B),
 * server-persisted args (RT-D), RBAC re-check, well-formed history (RT-F), per-user
 * isolation (RT-C), and the MAX_STEPS ceiling.
 */

const SYSTEM = "test system prompt";

/** A provider that yields each scripted turn's events in order, one per call. */
function fakeProvider(turns: StreamEvent[][]): StreamChat {
  let i = 0;
  return async function* () {
    const turn = turns[i++] ?? [{ type: "done", finishReason: "stop" }];
    for (const e of turn) yield e;
  };
}

const toolCallsTurn = (calls: { id: string; name: string; arguments: Record<string, unknown> }[]): StreamEvent[] => [
  { type: "tool_calls", calls },
  { type: "done", finishReason: "tool_calls" },
];
const textTurn = (text: string): StreamEvent[] => [
  { type: "text", delta: text },
  { type: "done", finishReason: "stop" },
];

async function drive(config: AgentConfig, input: AgentInput): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  for await (const e of runAgent(config, input)) out.push(e);
  return out;
}

describe("AI agent loop (Postgres + injected provider)", () => {
  let ws: string;
  let ctx: ToolContext;
  let viewerCtx: ToolContext;

  const contactCount = () => withWorkspace(ws, async () => (await db.select().from(tables.contacts)).length);
  // audit_log is immutable (0004: DELETE is a no-op), so rows accumulate across
  // tests in this file — scope audit assertions to the object created in the test.
  const auditsForObject = (objectId: string) =>
    withWorkspace(ws, () =>
      db
        .select()
        .from(tables.auditLog)
        .where(and(eq(tables.auditLog.action, "contact.created"), eq(tables.auditLog.objectId, objectId))),
    );
  const onlyContact = () => withWorkspace(ws, async () => (await db.select().from(tables.contacts))[0]);

  beforeAll(async () => {
    await resetDb();
    ws = await createWorkspace({ name: "Alpha" });
    ctx = { workspaceId: ws, role: "admin", userId: "u1", via: "ai" };
    viewerCtx = { workspaceId: ws, role: "viewer", userId: "u1", via: "ai" };
  });

  // Each test wipes CRM + chat rows so counts are independent (RESTART not needed).
  beforeEach(async () => {
    await withWorkspace(ws, async () => {
      await db.delete(tables.aiMessages);
      await db.delete(tables.aiConversations);
      await db.delete(tables.contacts);
      await db.delete(tables.activities);
      // Note: audit_log is append-only (immutable) — cannot be cleared here.
    });
  });

  const cfg = (turns: StreamEvent[][], c: ToolContext = ctx): AgentConfig => ({
    ctx: c,
    systemPrompt: SYSTEM,
    deps: { streamChat: fakeProvider(turns) },
  });

  it("runs a read tool inline and answers, writing nothing", async () => {
    const events = await drive(
      cfg([toolCallsTurn([{ id: "r1", name: "search", arguments: { query: "acme" } }]), textTurn("No matches.")]),
      { kind: "message", conversationId: null, message: "find acme" },
    );
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({ name: "search", ok: true });
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "stop" });
    expect(events.some((e) => e.type === "tool_proposal")).toBe(false);
    expect(await contactCount()).toBe(0);
  });

  it("stops at a write with a proposal and creates no row until confirmed", async () => {
    const events = await drive(
      cfg([toolCallsTurn([{ id: "w1", name: "create_contact", arguments: { firstName: "Ada" } }])]),
      { kind: "message", conversationId: null, message: "add Ada" },
    );
    const proposal = events.find((e) => e.type === "tool_proposal");
    expect(proposal).toMatchObject({ name: "create_contact", arguments: { firstName: "Ada" } });
    expect(events.some((e) => e.type === "awaiting_confirmation")).toBe(true);
    expect(await contactCount()).toBe(0); // nothing written pre-confirmation
  });

  it("confirm → executes once, audits via:'ai' exactly once, resumes (RT-A)", async () => {
    const config = cfg([
      toolCallsTurn([{ id: "w1", name: "create_contact", arguments: { firstName: "Ada" } }]),
      textTurn("Created Ada."),
    ]);
    const t1 = await drive(config, { kind: "message", conversationId: null, message: "add Ada" });
    const conversationId = (t1.find((e) => e.type === "conversation") as { conversationId: string }).conversationId;
    const messageId = (t1.find((e) => e.type === "tool_proposal") as { messageId: string }).messageId;

    const t2 = await drive(config, { kind: "decision", conversationId, messageId, approve: true });
    expect(t2.find((e) => e.type === "tool_result")).toMatchObject({ name: "create_contact", ok: true });
    expect(t2.at(-1)).toEqual({ type: "done", finishReason: "stop" });

    expect(await contactCount()).toBe(1);
    const contact = await onlyContact();
    const audits = await auditsForObject(contact.id);
    expect(audits).toHaveLength(1); // exactly one, no via:'mcp' duplicate (RT-A)
    expect(JSON.parse(audits[0].meta).via).toBe("ai");
  });

  it("double-confirm executes the write exactly once (RT-B)", async () => {
    const config = cfg([
      toolCallsTurn([{ id: "w1", name: "create_contact", arguments: { firstName: "Ada" } }]),
      textTurn("done"),
      textTurn("done"),
    ]);
    const t1 = await drive(config, { kind: "message", conversationId: null, message: "add Ada" });
    const conversationId = (t1.find((e) => e.type === "conversation") as { conversationId: string }).conversationId;
    const messageId = (t1.find((e) => e.type === "tool_proposal") as { messageId: string }).messageId;

    await Promise.all([
      drive(config, { kind: "decision", conversationId, messageId, approve: true }),
      drive(config, { kind: "decision", conversationId, messageId, approve: true }),
    ]);
    expect(await contactCount()).toBe(1);
    const contact = await onlyContact();
    expect(await auditsForObject(contact.id)).toHaveLength(1); // executed once (RT-B)
  });

  it("executes the SERVER-persisted proposal args, not any later input (RT-D)", async () => {
    const config = cfg([
      toolCallsTurn([{ id: "w1", name: "create_contact", arguments: { firstName: "Ada", lastName: "Lovelace" } }]),
      textTurn("ok"),
    ]);
    const t1 = await drive(config, { kind: "message", conversationId: null, message: "add Ada" });
    const conversationId = (t1.find((e) => e.type === "conversation") as { conversationId: string }).conversationId;
    const messageId = (t1.find((e) => e.type === "tool_proposal") as { messageId: string }).messageId;
    await drive(config, { kind: "decision", conversationId, messageId, approve: true });

    const rows = await withWorkspace(ws, () => db.select().from(tables.contacts));
    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("Ada");
    expect(rows[0].lastName).toBe("Lovelace");
  });

  it("reject → no row, resumes with a decline tool-result", async () => {
    const config = cfg([
      toolCallsTurn([{ id: "w1", name: "create_contact", arguments: { firstName: "Ada" } }]),
      textTurn("Okay, cancelled."),
    ]);
    const t1 = await drive(config, { kind: "message", conversationId: null, message: "add Ada" });
    const conversationId = (t1.find((e) => e.type === "conversation") as { conversationId: string }).conversationId;
    const messageId = (t1.find((e) => e.type === "tool_proposal") as { messageId: string }).messageId;

    const t2 = await drive(config, { kind: "decision", conversationId, messageId, approve: false });
    expect(t2.find((e) => e.type === "tool_result")).toMatchObject({ ok: false });
    expect(t2.at(-1)).toEqual({ type: "done", finishReason: "stop" });
    expect(await contactCount()).toBe(0);
  });

  it("viewer confirming a write is denied by RBAC, no row (mirrors mcp viewer-denied)", async () => {
    const config = cfg(
      [
        toolCallsTurn([{ id: "w1", name: "create_contact", arguments: { firstName: "Ada" } }]),
        textTurn("could not create"),
      ],
      viewerCtx,
    );
    const t1 = await drive(config, { kind: "message", conversationId: null, message: "add Ada" });
    const conversationId = (t1.find((e) => e.type === "conversation") as { conversationId: string }).conversationId;
    const messageId = (t1.find((e) => e.type === "tool_proposal") as { messageId: string }).messageId;

    const t2 = await drive(config, { kind: "decision", conversationId, messageId, approve: true });
    const result = t2.find((e) => e.type === "tool_result") as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Forbidden/);
    expect(await contactCount()).toBe(0);
  });

  it("a partial multi-read turn keeps history well-formed (RT-F)", async () => {
    // list_records with an unknown object errors; search succeeds. Both tool_call_ids
    // must still get a tool message so no dangling tool_call remains.
    const config = cfg([
      toolCallsTurn([
        { id: "a", name: "list_records", arguments: { object: "does-not-exist" } },
        { id: "b", name: "search", arguments: { query: "x" } },
      ]),
      textTurn("done"),
    ]);
    const events = await drive(config, { kind: "message", conversationId: null, message: "go" });
    const conversationId = (events.find((e) => e.type === "conversation") as { conversationId: string }).conversationId;

    const msgs = await withWorkspace(ws, () =>
      db.select().from(tables.aiMessages).where(eq(tables.aiMessages.conversationId, conversationId)),
    );
    const toolCallIds = msgs.filter((m) => m.role === "tool").map((m) => m.toolCallId).sort();
    expect(toolCallIds).toEqual(["a", "b"]); // every proposed call got a tool message
    expect(events.filter((e) => e.type === "tool_result")).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "stop" });
  });

  it("a different user cannot confirm another user's proposal (RT-C)", async () => {
    const config = cfg([
      toolCallsTurn([{ id: "w1", name: "create_contact", arguments: { firstName: "Ada" } }]),
      textTurn("ok"),
    ]);
    const t1 = await drive(config, { kind: "message", conversationId: null, message: "add Ada" });
    const conversationId = (t1.find((e) => e.type === "conversation") as { conversationId: string }).conversationId;
    const messageId = (t1.find((e) => e.type === "tool_proposal") as { messageId: string }).messageId;

    const u2Ctx: ToolContext = { workspaceId: ws, role: "admin", userId: "u2", via: "ai" };
    const u2Config: AgentConfig = { ...config, ctx: u2Ctx, deps: { streamChat: fakeProvider([textTurn("hi")]) } };
    await drive(u2Config, { kind: "decision", conversationId, messageId, approve: true });
    expect(await contactCount()).toBe(0); // U2's claim found nothing → no execution
  });

  it("terminates at MAX_STEPS when the model keeps calling a read tool", async () => {
    const alwaysRead = Array.from({ length: 10 }, () =>
      toolCallsTurn([{ id: "r", name: "get_dashboard_stats", arguments: {} }]),
    );
    const config: AgentConfig = { ctx, systemPrompt: SYSTEM, deps: { streamChat: fakeProvider(alwaysRead) }, maxSteps: 3 };
    const events = await drive(config, { kind: "message", conversationId: null, message: "loop" });
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "length" });
    expect(events.filter((e) => e.type === "tool_result")).toHaveLength(3); // one read per step, capped
  });
});
