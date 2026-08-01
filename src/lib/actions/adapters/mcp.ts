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
export function toMcpTool<I, O>(
  action: ActionDef<I, O>,
  opts: {
    name?: string;
    description?: string;
    /**
     * Argument names this tool already publishes, mapped to the action's own
     * names (`{ query: "q" }`). Existing clients keep working and the advertised
     * schema keeps saying what they already send.
     */
    rename?: Record<string, string>;
    /** Defaults this tool already applies, where they differ from the action's. */
    defaults?: Record<string, unknown>;
  } = {},
): McpTool {
  const schema = toJsonSchema(action.input);
  return {
    name: opts.name ?? action.name.replace(".", "_"),
    description: opts.description ?? action.description,
    inputSchema: applyNaming(schema, opts.rename, opts.defaults),
    // Reads run inline for the AI agent; writes are proposed and confirmed.
    mutates: action.verb !== "read",
    handler: (args, ctx) =>
      execute(action, { ...opts.defaults, ...translate(args, opts.rename) }, {
        ...ctx,
        // Everything reaching a tool is agent-initiated; the AI chat marks its
        // own calls "ai" and anything else is a plain MCP client.
        via: ctx.via ?? "mcp",
      }) as Promise<unknown>,
  };
}

/** Rewrite the tool's argument names to the action's. */
function translate(args: Record<string, unknown>, rename?: Record<string, string>): Record<string, unknown> {
  if (!rename) return args;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) out[rename[key] ?? key] = value;
  return out;
}

/** Advertise the tool's own argument names and defaults, not the action's. */
function applyNaming(
  schema: Record<string, unknown>,
  rename?: Record<string, string>,
  defaults?: Record<string, unknown>,
): Record<string, unknown> {
  if (!rename && !defaults) return schema;
  const reverse = Object.fromEntries(Object.entries(rename ?? {}).map(([tool, act]) => [act, tool]));
  const properties: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(schema.properties as Record<string, unknown>)) {
    const name = reverse[key] ?? key;
    const overridden = defaults && name in defaults;
    properties[name] = overridden ? { ...(spec as object), default: defaults[name] } : spec;
  }
  const required = (schema.required as string[] | undefined)?.map((f) => reverse[f] ?? f);
  return { ...schema, properties, ...(required ? { required } : {}) };
}
