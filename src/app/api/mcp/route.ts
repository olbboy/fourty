import { authenticate, tooManyRequests, json } from "@/lib/api";
import { apiRateLimit } from "@/lib/ratelimit";
import { handleMcpRequest, type JsonRpcRequest } from "@/mcp/server";
import type { ToolContext } from "@/mcp/tools";

/**
 * HTTP transport for the Fourty MCP server (ADR-015, Tier 1). Complements the
 * stdio transport (`npm run mcp`) so hosted/remote MCP clients (e.g. ChatGPT
 * connectors, web assistants) can reach a self-hosted Fourty over the network —
 * the one place Twenty ties MCP to its Cloud/OAuth offering.
 *
 * Authenticates with a workspace API key (Authorization: Bearer) or the app
 * session, then pipes each JSON-RPC message through the SAME handleMcpRequest the
 * stdio transport uses — so RLS, RBAC and field-permissions are enforced
 * identically (`tools/call` opens its own withWorkspace() transaction, so this
 * route must NOT wrap the handler in withAuth). Accepts a single request or a
 * JSON-RPC batch array.
 */
export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;

  const rl = apiRateLimit(req, `${auth.viaApiKey ? "key" : "user"}:${auth.callerId}`);
  if (!rl.allowed) return tooManyRequests("Rate limit exceeded", rl.retryAfter);

  const ctx: ToolContext = {
    workspaceId: auth.workspaceId,
    role: auth.role,
    userId: auth.user?.id ?? null,
  };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }

  if (Array.isArray(body)) {
    const out: unknown[] = [];
    for (const one of body) {
      const res = await handleMcpRequest(one as JsonRpcRequest, ctx);
      if (res) out.push(res);
    }
    return json(out);
  }

  const res = await handleMcpRequest(body as JsonRpcRequest, ctx);
  if (res === null) return new Response(null, { status: 202 }); // notification — no response body
  return json(res);
}
