import { withWorkspace } from "@/db";
import { log } from "@/lib/logger";
import { TOOLS, type Tool, type ToolContext } from "@/mcp/tools";
import { toProviderTools } from "./tool-bridge";
import { ProviderError, type ProviderMessage, type StreamChat, type ToolCall } from "./provider";
import {
  appendMessage,
  claimPendingMessage,
  createConversationWithFirstMessage,
  getPendingMessage,
  hasUnresolvedPending,
  listMessages,
  setToolResult,
  type AiMessage,
} from "./store";

/**
 * The stop-at-write agent loop (Phase 3). Each HTTP request is one bounded loop
 * (≤ MAX_STEPS): read tools run inline; the first turn that proposes a write
 * ends the stream in `awaiting_confirmation`. Confirmation arrives as a fresh
 * request (a `decision` input) which executes the server-persisted proposal and
 * resumes. The provider is INJECTED (`deps.streamChat`) so tests drive a fake
 * generator and never stub global fetch here.
 *
 * Safety invariants enforced here + in the store:
 *  - writes never auto-execute (proposed, human-confirmed) — the core guarantee;
 *  - the reused tool audits `via:"ai"` from ctx (no second audit — RT-A);
 *  - confirmed writes are atomically claimed (execute once — RT-B);
 *  - every `tool_call_id` gets a matching `tool` message (well-formed — RT-F);
 *  - LLM streaming holds no DB transaction; each DB touch is its own
 *    withWorkspace() (decision #2); reads run sequentially, not Promise.all (RT-G).
 */

export const MAX_STEPS = 8;

/** A fixed, generic surface for provider failures — raw upstream text is logged
 *  server-side only (it may leak internal host/port for a self-hosted endpoint — RT-I). */
export const GENERIC_PROVIDER_ERROR = "AI provider error — please retry.";

export type SseEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "tool_result"; name: string; ok: boolean; result?: unknown; error?: string }
  | { type: "tool_proposal"; messageId: string; name: string; arguments: Record<string, unknown> }
  | { type: "awaiting_confirmation" }
  | { type: "done"; finishReason: string }
  | { type: "error"; message: string };

export type AgentInput =
  | { kind: "message"; conversationId: string | null; message: string }
  | { kind: "decision"; conversationId: string; messageId: string; approve: boolean };

export type AgentConfig = {
  ctx: ToolContext; // must carry via:"ai"
  systemPrompt: string;
  deps: { streamChat: StreamChat };
  /**
   * The ownership principal for thread ACLs (RT-C). Distinct from ctx.userId (the
   * audit actor, which is null for API-key callers): a stable non-null id keeps
   * two API keys in one workspace from sharing a thread. Defaults to ctx.userId
   * for cookie sessions where the two coincide.
   */
  ownerId?: string | null;
  tools?: Tool[];
  maxSteps?: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function isMutating(tools: Tool[], name: string): boolean {
  return tools.find((t) => t.name === name)?.mutates === true;
}

function jsonify(v: unknown): string {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return "null";
  }
}

function errorContent(message?: string): string {
  return JSON.stringify({ error: message ?? "tool error" });
}

/** Execute one tool inside its own workspace transaction; errors are recoverable. */
async function execTool(
  ctx: ToolContext,
  tools: Tool[],
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    const result = await withWorkspace(ctx.workspaceId, () => tool.handler(args, ctx));
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Map persisted history to provider message shapes (assistant tool_calls round-trip). */
function toProviderMessages(systemPrompt: string, history: AiMessage[]): ProviderMessage[] {
  const out: ProviderMessage[] = [{ role: "system", content: systemPrompt }];
  for (const m of history) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const tc = m.toolCalls?.length
        ? m.toolCalls.map((c) => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.name, arguments: JSON.stringify(c.arguments) },
          }))
        : undefined;
      out.push({ role: "assistant", content: m.content, ...(tc ? { tool_calls: tc } : {}) });
    } else {
      out.push({ role: "tool", content: m.content, tool_call_id: m.toolCallId ?? "" });
    }
  }
  return out;
}

// ── Entry point ────────────────────────────────────────────────────────────────

export async function* runAgent(config: AgentConfig, input: AgentInput): AsyncGenerator<SseEvent> {
  const { ctx } = config;
  const tools = config.tools ?? TOOLS;
  const ownerId = config.ownerId ?? ctx.userId;

  if (input.kind === "message") {
    let conversationId: string;
    if (input.conversationId) {
      conversationId = input.conversationId;
      await withWorkspace(ctx.workspaceId, () =>
        appendMessage({ conversationId, role: "user", content: input.message }),
      );
    } else {
      const created = await withWorkspace(ctx.workspaceId, () =>
        createConversationWithFirstMessage(ownerId, { role: "user", content: input.message }),
      );
      conversationId = created.conversationId;
    }
    yield { type: "conversation", conversationId };
    yield* loop(config, tools, ownerId, conversationId);
  } else {
    // The conversation to resume comes from the MESSAGE itself, not the client body
    // (RT-C/M2): a mismatched-but-owned conversationId can't redirect the loop.
    const resumeCid = yield* applyDecision(config, tools, ownerId, input.messageId, input.approve);
    if (resumeCid) yield* loop(config, tools, ownerId, resumeCid);
  }
}

// ── Decision path (confirm / reject a proposed write) ──────────────────────────

async function* applyDecision(
  config: AgentConfig,
  tools: Tool[],
  ownerId: string | null,
  messageId: string,
  approve: boolean,
): AsyncGenerator<SseEvent, string | null> {
  const { ctx } = config;
  let conversationId: string;
  if (approve) {
    // Atomic claim first (RT-B): a replayed/double confirm sees null → no-op.
    const claim = await withWorkspace(ctx.workspaceId, () => claimPendingMessage(messageId, ownerId));
    if (!claim) return null; // already handled / not owned — do not execute again
    conversationId = claim.conversationId;
    // Execute from SERVER-persisted args, never the client body (RT-D).
    const call = claim.toolCalls[0];
    const res = await execTool(ctx, tools, call.name, call.arguments);
    await withWorkspace(ctx.workspaceId, () =>
      setToolResult(messageId, res.ok ? jsonify(res.result) : errorContent(res.error), "complete"),
    );
    yield { type: "tool_result", name: call.name, ok: res.ok, ...(res.ok ? { result: res.result } : { error: res.error }) };
  } else {
    // Reject: verify ownership + pending status, then fill the proposal's tool
    // result with a decline note so the assistant tool_call still has a matching
    // tool message (RT-F). A non-owned / already-resolved id is a no-op.
    const pending = await withWorkspace(ctx.workspaceId, () => getPendingMessage(messageId, ownerId));
    if (!pending) return null;
    conversationId = pending.conversationId;
    await withWorkspace(ctx.workspaceId, () =>
      setToolResult(messageId, JSON.stringify({ declined: true }), "rejected"),
    );
    yield { type: "tool_result", name: "declined", ok: false, error: "declined" };
  }

  // If other writes in this turn are still pending, wait for them too.
  const stillPending = await withWorkspace(ctx.workspaceId, () => hasUnresolvedPending(conversationId, ownerId));
  if (stillPending) {
    yield { type: "awaiting_confirmation" };
    return null;
  }
  return conversationId;
}

// ── The bounded loop ──────────────────────────────────────────────────────────

async function* loop(
  config: AgentConfig,
  tools: Tool[],
  ownerId: string | null,
  conversationId: string,
): AsyncGenerator<SseEvent> {
  const { ctx, systemPrompt, deps } = config;
  const maxSteps = config.maxSteps ?? MAX_STEPS;
  const providerTools = toProviderTools(tools);

  const history = await withWorkspace(ctx.workspaceId, () => listMessages(conversationId, ownerId));

  for (let step = 0; step < maxSteps; step++) {
    const messages = toProviderMessages(systemPrompt, history);
    let assistantText = "";
    let toolCalls: ToolCall[] | null = null;
    let finishReason = "stop";

    try {
      for await (const evt of deps.streamChat({ messages, tools: providerTools })) {
        if (evt.type === "text") {
          assistantText += evt.delta;
          yield { type: "delta", text: evt.delta };
        } else if (evt.type === "tool_calls") {
          toolCalls = evt.calls;
        } else {
          finishReason = evt.finishReason;
        }
      }
    } catch (e) {
      // RT-I: log the raw detail server-side only; stream + persist a generic message.
      const detail = e instanceof ProviderError ? e.detail : e instanceof Error ? e.message : String(e);
      log({ workspace_id: ctx.workspaceId }).error({ err: detail }, "ai provider error");
      await withWorkspace(ctx.workspaceId, () =>
        appendMessage({ conversationId, role: "assistant", content: GENERIC_PROVIDER_ERROR }),
      );
      yield { type: "error", message: GENERIC_PROVIDER_ERROR };
      return;
    }

    if (!toolCalls || toolCalls.length === 0) {
      await withWorkspace(ctx.workspaceId, () =>
        appendMessage({ conversationId, role: "assistant", content: assistantText }),
      );
      yield { type: "done", finishReason };
      return;
    }

    // Persist the assistant message carrying every tool_call, then handle them.
    const assistantMsg = await withWorkspace(ctx.workspaceId, () =>
      appendMessage({
        conversationId,
        role: "assistant",
        content: assistantText,
        toolCalls: toolCalls!.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })),
      }),
    );
    history.push(assistantMsg);

    const writes: ToolCall[] = [];
    for (const call of toolCalls) {
      if (isMutating(tools, call.name)) {
        writes.push(call);
        continue;
      }
      // Read: execute inline, sequentially (RT-G), persist its tool result.
      const res = await execTool(ctx, tools, call.name, call.arguments);
      const content = res.ok ? jsonify(res.result) : errorContent(res.error);
      const toolMsg = await withWorkspace(ctx.workspaceId, () =>
        appendMessage({ conversationId, role: "tool", toolCallId: call.id, content }),
      );
      history.push(toolMsg);
      yield { type: "tool_result", name: call.name, ok: res.ok, ...(res.ok ? { result: res.result } : { error: res.error }) };
    }

    if (writes.length > 0) {
      // Stop at the write(s): persist each as a pending tool result and propose it.
      for (const call of writes) {
        const pending = await withWorkspace(ctx.workspaceId, () =>
          appendMessage({
            conversationId,
            role: "tool",
            toolCallId: call.id,
            content: "",
            status: "pending_confirmation",
            toolCalls: [{ id: call.id, name: call.name, arguments: call.arguments }],
          }),
        );
        yield { type: "tool_proposal", messageId: pending.id, name: call.name, arguments: call.arguments };
      }
      yield { type: "awaiting_confirmation" };
      return;
    }
    // All reads handled — continue the loop with results appended to history.
  }

  // Hit the step ceiling: end cleanly with a truncation note.
  await withWorkspace(ctx.workspaceId, () =>
    appendMessage({ conversationId, role: "assistant", content: "(Stopped: reached the step limit for this turn.)" }),
  );
  yield { type: "done", finishReason: "length" };
}
