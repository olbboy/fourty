import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";
import { withWorkspace } from "@/db";
import * as store from "@/lib/ai/store";

/**
 * AI persistence store (Phase 2) against real Postgres + RLS. Two workspaces
 * (A, B) and two users (U1, U2) in workspace A prove the two isolation layers:
 * RLS for cross-tenant, and the store's per-user ownership ACL for
 * workspace-mates (RT-C). Also covers the atomic single-claim (RT-B), the
 * server-persisted proposal accessor (RT-D), no-orphan create (RT-K), and the
 * pending guard (RT-F).
 */
describe("AI store (Postgres + RLS + per-user ACL)", () => {
  let wsA: string;
  let wsB: string;
  const U1 = "user-one";
  const U2 = "user-two";

  const inA = <T>(fn: () => Promise<T>) => withWorkspace(wsA, fn);
  const inB = <T>(fn: () => Promise<T>) => withWorkspace(wsB, fn);

  beforeAll(async () => {
    await resetDb();
    wsA = await createWorkspace({ name: "Alpha" });
    wsB = await createWorkspace({ name: "Beta" });
  });

  it("creates a conversation + first message atomically and reads them back in order (RT-K)", async () => {
    const { conversationId } = await inA(() =>
      store.createConversationWithFirstMessage(U1, { role: "user", content: "hello" }),
    );
    await inA(() =>
      store.appendMessage({
        conversationId,
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "search", arguments: { query: "acme" } }],
      }),
    );
    await inA(() =>
      store.appendMessage({
        conversationId,
        role: "tool",
        toolCallId: "call_1",
        content: JSON.stringify({ contacts: [] }),
      }),
    );

    const msgs = await inA(() => store.listMessages(conversationId, U1));
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(msgs[0].content).toBe("hello");
    expect(msgs[1].toolCalls).toEqual([{ id: "call_1", name: "search", arguments: { query: "acme" } }]);
    expect(msgs[2].toolCallId).toBe("call_1");
    // The conversation exists WITH its first message — no orphan window.
    const conv = await inA(() => store.getConversation(conversationId, U1));
    expect(conv?.userId).toBe(U1);
  });

  it("atomically claims a pending write exactly once (RT-B) and exposes it via getPendingMessage (RT-D)", async () => {
    const { conversationId } = await inA(() =>
      store.createConversationWithFirstMessage(U1, { role: "user", content: "add Ada" }),
    );
    const proposal = await inA(() =>
      store.appendMessage({
        conversationId,
        role: "assistant",
        content: "",
        status: "pending_confirmation",
        toolCalls: [{ id: "c1", name: "create_contact", arguments: { firstName: "Ada" } }],
      }),
    );

    // RT-D: server-persisted proposal is retrievable and carries the real args.
    const pending = await inA(() => store.getPendingMessage(proposal.id, U1));
    expect(pending?.status).toBe("pending_confirmation");
    expect(pending?.toolCalls).toEqual([{ id: "c1", name: "create_contact", arguments: { firstName: "Ada" } }]);

    // RT-B: two concurrent claims — exactly one wins, the other gets null.
    const [a, b] = await Promise.all([
      inA(() => store.claimPendingMessage(proposal.id, U1)),
      inA(() => store.claimPendingMessage(proposal.id, U1)),
    ]);
    const winners = [a, b].filter((x) => x !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]!.toolCalls).toEqual([{ id: "c1", name: "create_contact", arguments: { firstName: "Ada" } }]);

    // After the claim the message is `executing`; a later claim still returns null.
    const late = await inA(() => store.claimPendingMessage(proposal.id, U1));
    expect(late).toBeNull();

    await inA(() => store.setMessageStatus(proposal.id, "complete"));
    const after = await inA(() => store.listMessages(conversationId, U1));
    expect(after.find((m) => m.id === proposal.id)?.status).toBe("complete");
  });

  it("hasUnresolvedPending gates a new turn while a write awaits confirmation (RT-F)", async () => {
    const { conversationId } = await inA(() =>
      store.createConversationWithFirstMessage(U1, { role: "user", content: "add Bob" }),
    );
    const proposal = await inA(() =>
      store.appendMessage({
        conversationId,
        role: "assistant",
        status: "pending_confirmation",
        toolCalls: [{ id: "c2", name: "create_contact", arguments: { firstName: "Bob" } }],
      }),
    );
    expect(await inA(() => store.hasUnresolvedPending(conversationId, U1))).toBe(true);
    await inA(() => store.setMessageStatus(proposal.id, "rejected"));
    expect(await inA(() => store.hasUnresolvedPending(conversationId, U1))).toBe(false);
  });

  it("isolates across workspaces via RLS (RT-C tenant layer)", async () => {
    const { conversationId } = await inA(() =>
      store.createConversationWithFirstMessage(U1, { role: "user", content: "secret A" }),
    );
    // Workspace B, even claiming to be U1, sees nothing — RLS hides the row.
    expect(await inB(() => store.getConversation(conversationId, U1))).toBeUndefined();
    expect(await inB(() => store.listMessages(conversationId, U1))).toEqual([]);
  });

  it("isolates across users in the SAME workspace via the store ACL (RT-C per-user layer)", async () => {
    const { conversationId } = await inA(() =>
      store.createConversationWithFirstMessage(U1, { role: "user", content: "U1 only" }),
    );
    const proposal = await inA(() =>
      store.appendMessage({
        conversationId,
        role: "assistant",
        status: "pending_confirmation",
        toolCalls: [{ id: "c3", name: "create_contact", arguments: { firstName: "X" } }],
      }),
    );

    // U2 is a workspace-mate (same RLS scope) but NOT the owner → every accessor denies.
    expect(await inA(() => store.getConversation(conversationId, U2))).toBeUndefined();
    expect(await inA(() => store.listMessages(conversationId, U2))).toEqual([]);
    expect(await inA(() => store.getPendingMessage(proposal.id, U2))).toBeUndefined();
    expect(await inA(() => store.claimPendingMessage(proposal.id, U2))).toBeNull();
    expect(await inA(() => store.hasUnresolvedPending(conversationId, U2))).toBe(false);

    // U1 (owner) still can — proving the deny above is ownership, not a broken row.
    expect((await inA(() => store.getConversation(conversationId, U1)))?.userId).toBe(U1);
    expect(await inA(() => store.claimPendingMessage(proposal.id, U1))).not.toBeNull();
  });
});
