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

// MCP resources (ADR-016, Tier 1): named, read-only CRM context an LLM can pull
// without a tool call. Each maps to an existing tool handler, so RLS + RBAC +
// field-permissions apply identically — a resource is not a bypass door.
const RESOURCES: { uri: string; name: string; description: string; tool: string }[] = [
  { uri: "fourty://dashboard", name: "Dashboard analytics", description: "Pipeline value, forecast, win rate, funnel.", tool: "get_dashboard_stats" },
  { uri: "fourty://custom-objects", name: "Custom object types", description: "The workspace's no-code object definitions.", tool: "list_custom_objects" },
];

// MCP prompts (ADR-016, Tier 1): reusable prompt templates. These return message
// text ONLY — Fourty runs no model itself; the client's LLM consumes them. This
// is the standards-based home for Fourty's AI templates without any dependency.
const PROMPTS: {
  name: string;
  description: string;
  arguments: { name: string; description: string; required: boolean }[];
  build: (a: Record<string, unknown>) => { role: "user"; content: { type: "text"; text: string } }[];
}[] = [
  {
    name: "summarize_pipeline",
    description: "Draft a concise summary of current sales-pipeline health.",
    arguments: [],
    build: () => [
      {
        role: "user",
        content: {
          type: "text",
          text: "Read the fourty://dashboard resource and summarize pipeline health in 5 bullets: total pipeline value, weighted forecast, win rate, and the two biggest risks. Be concise.",
        },
      },
    ],
  },
  {
    name: "draft_followup",
    description: "Draft a short follow-up email to a contact.",
    arguments: [{ name: "contactId", description: "The contact's id", required: true }],
    build: (a) => [
      {
        role: "user",
        content: {
          type: "text",
          text: `Look up contact ${String(a.contactId ?? "<id>")} (via list_contacts or search) and draft a short, warm follow-up email. Return only the email body.`,
        },
      },
    ],
  },
];

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
        capabilities: { tools: {}, resources: {}, prompts: {} },
      });

    case "notifications/initialized":
      return null; // client ack — no response

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });

    case "resources/list":
      return ok(id, {
        resources: RESOURCES.map((r) => ({ uri: r.uri, name: r.name, description: r.description, mimeType: "application/json" })),
      });

    case "resources/read": {
      const uri = req.params?.uri as string | undefined;
      const res = RESOURCES.find((r) => r.uri === uri);
      if (!res) return err(id, -32602, `Unknown resource: ${uri}`);
      const tool = toolByName.get(res.tool)!;
      try {
        // Same RLS + RBAC + field-perm path as a tool call — not a bypass door.
        const data = await withWorkspace(ctx.workspaceId, () => tool.handler({}, ctx));
        return ok(id, { contents: [{ uri: res.uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] });
      } catch (e) {
        return err(id, -32603, e instanceof Error ? e.message : "resource read failed");
      }
    }

    case "prompts/list":
      return ok(id, {
        prompts: PROMPTS.map((p) => ({ name: p.name, description: p.description, arguments: p.arguments })),
      });

    case "prompts/get": {
      const name = req.params?.name as string | undefined;
      const prompt = PROMPTS.find((p) => p.name === name);
      if (!prompt) return err(id, -32602, `Unknown prompt: ${name}`);
      const promptArgs = (req.params?.arguments as Record<string, unknown>) ?? {};
      return ok(id, { description: prompt.description, messages: prompt.build(promptArgs) });
    }

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
