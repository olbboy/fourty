import { withWorkspace } from "@/db";
import { TOOLS, ToolError, type ToolContext } from "./tools";

/**
 * Fourty MCP server (Gate B6/D, ADR-010). A dependency-free implementation of the
 * MCP JSON-RPC subset an LLM client needs: initialize, tools/list, tools/call
 * (plus ping). Each tool call runs inside withWorkspace() so Postgres RLS scopes
 * it to the authenticated key's workspace and RBAC is enforced per tool. The
 * transport (stdio/HTTP) is separate — this module is pure request→response and
 * therefore directly unit-testable.
 */
export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const SERVER_INFO = { name: "fourty", version: "1.0.0" };

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

const toolByName = new Map(TOOLS.map((t) => [t.name, t]));

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function err(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Handle one JSON-RPC request in the context of an authenticated workspace.
 * Returns null for notifications (no id / no response expected).
 */
export async function handleMcpRequest(
  req: JsonRpcRequest,
  ctx: ToolContext,
): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  const isNotification = req.id === undefined;

  switch (req.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
      });

    case "notifications/initialized":
      return null; // client ack — no response

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });

    case "tools/call": {
      const name = req.params?.name as string | undefined;
      const args = (req.params?.arguments as Record<string, unknown>) ?? {};
      const tool = name ? toolByName.get(name) : undefined;
      if (!tool) return err(id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await withWorkspace(ctx.workspaceId, () => tool.handler(args, ctx));
        return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        // Tool-level errors travel as an isError result (per MCP), not a protocol error.
        const message = e instanceof ToolError ? e.message : e instanceof Error ? e.message : "tool failed";
        return ok(id, { content: [{ type: "text", text: message }], isError: true });
      }
    }

    default:
      if (isNotification) return null;
      return err(id, -32601, `Method not found: ${req.method}`);
  }
}
