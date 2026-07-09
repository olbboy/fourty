import { randomUUID } from "node:crypto";
import { withContext, withWorkspace } from "@/db";
import { apiError, authenticate, json, tooManyRequests } from "@/lib/api";
import { apiRateLimit, type RateLimitResult } from "@/lib/ratelimit";
import { normalizeRoute, recordHttp } from "@/lib/metrics";
import { log } from "@/lib/logger";
import type { ToolContext } from "@/mcp/tools";
import { isAiEnabled, streamChat } from "@/lib/ai/provider";
import { runAgent, GENERIC_PROVIDER_ERROR, type AgentInput, type SseEvent } from "@/lib/ai/agent";
import { buildSystemPrompt, localeFromRequest } from "@/lib/ai/prompt";
import { aiTurnQuota } from "@/lib/ai/quota";
import { getConversation, hasUnresolvedPending, latestConversation, listMessages } from "@/lib/ai/store";

// The stream must not be statically cached; it is per-request and long-lived.
export const dynamic = "force-dynamic";

/**
 * Emit HTTP metrics + a structured access log for a response. The chat route
 * bypasses withAuth (so an LLM stream never holds a Postgres transaction open —
 * decision #2), so it re-adds this seam itself for EVERY response, including
 * early failures (401/429/409) which are the most important abuse signals (RT-H).
 */
function record(
  route: string,
  method: string,
  requestId: string,
  workspaceId: string | undefined,
  startedAt: number,
  res: Response,
): Response {
  const durationMs = performance.now() - startedAt;
  recordHttp(route, method, res.status, durationMs / 1000);
  log({ request_id: requestId, workspace_id: workspaceId }).info(
    { route, method, status: res.status, duration_ms: Math.round(durationMs) },
    "request",
  );
  return res;
}

function withRateLimitHeaders(res: Response, rl: RateLimitResult): Response {
  res.headers.set("RateLimit-Limit", String(rl.limit));
  res.headers.set("RateLimit-Remaining", String(rl.remaining));
  res.headers.set("RateLimit-Reset", String(rl.resetSeconds));
  if (!rl.allowed) res.headers.set("Retry-After", String(rl.retryAfter));
  return res;
}

/** The audit actor (null for API keys, like MCP/REST) and the thread ownership
 *  principal (stable + never null so two API keys can't share a thread — RT-C). */
function principals(auth: { viaApiKey: boolean; callerId: string }) {
  const identity = `${auth.viaApiKey ? "key" : "user"}:${auth.callerId}`;
  return { identity, ownerId: identity, auditUserId: auth.viaApiKey ? null : auth.callerId };
}

/**
 * POST /api/ai/chat — the conversational agent over hand-rolled SSE.
 *
 * Two payloads share this route: a new/continuing turn `{ conversationId?, message }`
 * and a confirm/reject `{ conversationId, decision:{ messageId, approve } }`.
 */
export async function POST(req: Request): Promise<Response> {
  const startedAt = performance.now();
  const requestId = randomUUID();
  const route = normalizeRoute(new URL(req.url).pathname);
  const done = (res: Response, ws?: string) => record(route, req.method, requestId, ws, startedAt, res);

  if (!isAiEnabled()) return done(apiError("AI disabled", 404));

  const auth = await authenticate(req);
  if (!auth.ok) return done(auth.response);

  const { identity, ownerId, auditUserId } = principals(auth);

  // Whole-API burst limit (per caller + IP + route class), same as withAuth.
  const rl = apiRateLimit(req, identity);
  if (!rl.allowed) {
    return done(withRateLimitHeaders(tooManyRequests("Rate limit exceeded", rl.retryAfter), rl), auth.workspaceId);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return done(apiError("Invalid JSON body"), auth.workspaceId);
  }
  const input = parseInput(body);
  if (!input) {
    return done(apiError("Expected { message } or { conversationId, decision:{ messageId, approve } }"), auth.workspaceId);
  }

  // AI turn quota (RT-E) applies only to message turns — they always call the LLM.
  // A decision (confirm/reject) must never be blocked, else a pending write wedges
  // the thread (can't send: 409; can't confirm: 429) until the window resets (M3).
  if (input.kind === "message") {
    const q = aiTurnQuota(identity);
    if (!q.allowed) return done(tooManyRequests("AI rate limit exceeded", q.retryAfter), auth.workspaceId);
  }

  const ctx: ToolContext = { workspaceId: auth.workspaceId, role: auth.role, userId: auditUserId, via: "ai" };

  // Ownership (RT-C) + pending guard (RT-F) for an existing conversation.
  if (input.conversationId) {
    const cid = input.conversationId;
    const owned = await withWorkspace(ctx.workspaceId, () => getConversation(cid, ownerId));
    if (!owned) return done(apiError("Conversation not found", 404), ctx.workspaceId);
    if (input.kind === "message") {
      const pending = await withWorkspace(ctx.workspaceId, () => hasUnresolvedPending(cid, ownerId));
      if (pending) {
        return done(apiError("Resolve the pending action before sending a new message", 409), ctx.workspaceId);
      }
    }
  }

  const systemPrompt = buildSystemPrompt(localeFromRequest(req), new Date());
  const stream = sseStream(() => runAgent({ ctx, ownerId, systemPrompt, deps: { streamChat } }, input), {
    requestId,
    workspaceId: ctx.workspaceId,
    route,
    method: req.method,
    startedAt,
  });

  // The streaming Response records its own metrics at close (see sseStream), so it
  // is returned directly, not via done(). `Connection` is a forbidden response
  // header; `no-transform` + X-Accel-Buffering are what stop proxies buffering.
  return withRateLimitHeaders(
    new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    }),
    rl,
  );
}

/**
 * GET /api/ai/chat[?conversationId=] — restore a thread on mount. Owner-scoped
 * (RT-C): another principal's thread yields an empty result. Each message carries
 * its `status` so the client can re-render a live confirm card for any
 * `pending_confirmation` write (RT-F). With no id, returns the most recent thread.
 */
export async function GET(req: Request): Promise<Response> {
  const startedAt = performance.now();
  const requestId = randomUUID();
  const route = normalizeRoute(new URL(req.url).pathname);
  const done = (res: Response, ws?: string) => record(route, req.method, requestId, ws, startedAt, res);

  if (!isAiEnabled()) return done(apiError("AI disabled", 404));
  const auth = await authenticate(req);
  if (!auth.ok) return done(auth.response);

  const { identity, ownerId } = principals(auth);
  const rl = apiRateLimit(req, identity);
  if (!rl.allowed) {
    return done(withRateLimitHeaders(tooManyRequests("Rate limit exceeded", rl.retryAfter), rl), auth.workspaceId);
  }

  const requested = new URL(req.url).searchParams.get("conversationId");
  const result = await withWorkspace(auth.workspaceId, async () => {
    const conv = requested ? await getConversation(requested, ownerId) : await latestConversation(ownerId);
    if (!conv) return { conversationId: null, messages: [] };
    return { conversationId: conv.id, messages: await listMessages(conv.id, ownerId) };
  });
  return done(withRateLimitHeaders(json(result), rl), auth.workspaceId);
}

/** Discriminate the two payload shapes; returns null on anything malformed. */
function parseInput(body: unknown): AgentInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.decision && typeof b.decision === "object") {
    const d = b.decision as Record<string, unknown>;
    if (
      typeof b.conversationId === "string" &&
      typeof d.messageId === "string" &&
      typeof d.approve === "boolean"
    ) {
      return { kind: "decision", conversationId: b.conversationId, messageId: d.messageId, approve: d.approve };
    }
    return null;
  }
  if (typeof b.message === "string" && b.message.trim()) {
    return {
      kind: "message",
      conversationId: typeof b.conversationId === "string" ? b.conversationId : null,
      message: b.message,
    };
  }
  return null;
}

type Obs = { requestId: string; workspaceId: string; route: string; method: string; startedAt: number };

/**
 * Drive the agent generator into an SSE ReadableStream. The whole run executes
 * inside withContext (so logs/audit carry request_id + workspace_id) and, on
 * close — success OR error — records HTTP metrics + a structured access log
 * exactly once (RT-H). Each DB touch inside the agent opens its own short
 * withWorkspace transaction; none spans the LLM stream (decision #2).
 */
function sseStream(run: () => AsyncGenerator<SseEvent>, obs: Obs): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let status = 200;
      try {
        await withContext({ requestId: obs.requestId, workspaceId: obs.workspaceId }, async () => {
          for await (const evt of run()) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(evt)}\n\n`));
            if (evt.type === "error") status = 500;
          }
        });
      } catch (e) {
        status = 500;
        log({ request_id: obs.requestId, workspace_id: obs.workspaceId }).error(
          { err: e instanceof Error ? e.message : String(e) },
          "ai chat stream failed",
        );
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", message: GENERIC_PROVIDER_ERROR })}\n\n`));
      } finally {
        record(obs.route, obs.method, obs.requestId, obs.workspaceId, obs.startedAt, new Response(null, { status }));
        controller.close();
      }
    },
  });
}
