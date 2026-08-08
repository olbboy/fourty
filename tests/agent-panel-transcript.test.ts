import { describe, expect, it } from "vitest";
import { resolveThread, toItems, turnFrom, type StoredMessage, type Thread } from "@/components/agent-panel/transcript";

/**
 * Stored messages → what the panel shows, and which thread it lands on
 * (Phase 4). Both are the difference between "my history is there" and "my
 * history only appears if I refresh".
 */

const message = (over: Partial<StoredMessage> = {}): StoredMessage => ({
  id: "m1",
  role: "user",
  content: "hello",
  toolCalls: null,
  status: "complete",
  createdAt: 1_000,
  ...over,
});

describe("rendering a stored thread", () => {
  it("keeps one row per message, and none for a bare tool turn", () => {
    const items = toItems([
      message({ id: "m1", role: "user", content: "who is this?" }),
      // An assistant turn that only called a tool has no text to show.
      message({ id: "m2", role: "assistant", content: "", toolCalls: [{ id: "t1", name: "get_contact", arguments: {} }] }),
      message({ id: "m3", role: "tool", content: "{}", toolCallId: "t1" } as Partial<StoredMessage>),
      message({ id: "m4", role: "assistant", content: "Ada, Head of Security." }),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "assistant"]);
  });

  it("brings an unconfirmed write back as a live card", () => {
    const items = toItems([
      message({
        id: "m9",
        role: "tool",
        status: "pending_confirmation",
        toolCalls: [{ id: "t1", name: "update_contact", arguments: { jobTitle: "COO" } }],
      }),
    ]);
    expect(items).toEqual([
      { kind: "proposal", messageId: "m9", name: "update_contact", args: { jobTitle: "COO" } },
    ]);
  });
});

describe("what the thread was doing when we left it", () => {
  it("is idle on an empty thread", () => {
    expect(turnFrom([])).toEqual({ kind: "idle" });
  });

  it("is awaiting confirmation while a proposal is unresolved", () => {
    const messages = [
      message({ id: "m1" }),
      message({ id: "m2", role: "tool", status: "pending_confirmation", toolCalls: [{ id: "t", name: "x", arguments: {} }] }),
    ];
    expect(turnFrom(messages)).toEqual({ kind: "awaiting_confirmation" });
  });

  /**
   * The wedge this exists to unstick: a worker killed mid-write leaves
   * `executing` behind with no closing boundary, and the send route refuses new
   * messages until it resolves. Reporting it as a turn lets the quiet timeout
   * call it ended instead of locking the thread forever.
   */
  it("reports a stranded executing write as a turn, dated when it was written", () => {
    expect(turnFrom([message({ id: "m1", role: "tool", status: "executing", createdAt: 4_242 })])).toEqual({
      kind: "streaming",
      lastEventAt: 4_242,
    });
  });

  it("is idle once the last message completed", () => {
    expect(turnFrom([message({ id: "m1", role: "assistant", content: "done" })])).toEqual({ kind: "idle" });
  });
});

describe("choosing the thread to open", () => {
  const threads: Thread[] = [
    { id: "old", title: null, updatedAt: 100 },
    { id: "new", title: null, updatedAt: 300 },
    { id: "middle", title: null, updatedAt: 200 },
  ];

  it("honours an explicit ?thread= that exists", () => {
    expect(resolveThread(threads, "middle")).toBe("middle");
  });

  it("opens the newest when nothing was asked for", () => {
    expect(resolveThread(threads, null)).toBe("new");
  });

  it("starts fresh rather than guessing when ?thread= is from another record", () => {
    // A stale id in the URL after navigating between records must not silently
    // open somebody else's — or anybody else's — conversation.
    expect(resolveThread(threads, "not-in-this-list")).toBeNull();
  });

  it("opens a blank thread on a record nobody has asked about", () => {
    expect(resolveThread([], null)).toBeNull();
  });
});
