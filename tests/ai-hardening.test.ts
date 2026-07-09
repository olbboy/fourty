import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";
import { db, tables, withWorkspace } from "@/db";
import type { ToolContext } from "@/mcp/tools";
import { ProviderError, type StreamChat } from "@/lib/ai/provider";
import { runAgent, GENERIC_PROVIDER_ERROR, type AgentConfig, type SseEvent } from "@/lib/ai/agent";

/**
 * Guardrail hardening (Phase 5). A provider failure must never crash the loop
 * and must surface only as a fixed generic message — the raw upstream text
 * (which for a self-hosted endpoint can leak internal host/port) is logged
 * server-side, never streamed or persisted (RT-I).
 */
describe("AI hardening: provider errors are sanitized", () => {
  let ws: string;
  let ctx: ToolContext;

  beforeAll(async () => {
    await resetDb();
    ws = await createWorkspace({ name: "Alpha" });
    ctx = { workspaceId: ws, role: "admin", userId: "u1", via: "ai" };
  });

  it("surfaces a generic error, persists a generic message, and does not throw", async () => {
    const LEAK = "internal-llm-host:11434 connection refused";
    const throwing: StreamChat = async function* () {
      throw new ProviderError("upstream failed", LEAK);
    };
    const config: AgentConfig = { ctx, systemPrompt: "sys", deps: { streamChat: throwing } };

    const events: SseEvent[] = [];
    for await (const e of runAgent(config, { kind: "message", conversationId: null, message: "hi" })) {
      events.push(e);
    }

    const err = events.find((e) => e.type === "error") as { message: string } | undefined;
    expect(err?.message).toBe(GENERIC_PROVIDER_ERROR);
    // No event leaks the raw upstream detail.
    expect(JSON.stringify(events)).not.toContain(LEAK);

    // A generic assistant error message is persisted (never the raw detail).
    const conversationId = (events.find((e) => e.type === "conversation") as { conversationId: string }).conversationId;
    const msgs = await withWorkspace(ws, () =>
      db.select().from(tables.aiMessages).where(eq(tables.aiMessages.conversationId, conversationId)),
    );
    const assistant = msgs.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe(GENERIC_PROVIDER_ERROR);
    expect(msgs.every((m) => !m.content.includes(LEAK))).toBe(true);
  });
});
