import { execute } from "../execute";
import { toJsonSchema } from "../json-schema";
import type { ActionDef } from "../types";

/**
 * The tool shape `src/mcp/tools.ts` publishes. Declared structurally rather
 * than imported so the kernel and the tool list do not import each other.
 */
export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutates: boolean;
  handler: (args: Record<string, unknown>, ctx: { workspaceId: string; role: string; userId: string | null; via?: string }) => Promise<unknown>;
};

/**
 * Serve an action as an MCP tool. The advertised schema is generated from the
 * same zod schema that validates the call, so what an agent is told and what is
 * enforced cannot drift apart.
 *
 * Errors propagate as-is: the MCP server already turns any thrown error into an
 * `isError` result carrying its message, so no error class is imported here.
 */
export function toMcpTool<I, O>(action: ActionDef<I, O>, opts: { name?: string } = {}): McpTool {
  return {
    name: opts.name ?? action.name.replace(".", "_"),
    description: action.description,
    inputSchema: toJsonSchema(action.input),
    // Reads run inline for the AI agent; writes are proposed and confirmed.
    mutates: action.verb !== "read",
    handler: (args, ctx) => execute(action, args, ctx) as Promise<unknown>,
  };
}
