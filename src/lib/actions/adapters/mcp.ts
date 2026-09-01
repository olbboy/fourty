import { execute } from "../execute";
import { toJsonSchema } from "../json-schema";
import { recordBinding } from "../registry";
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
    /**
     * Ceilings this tool already enforces. A tool answers an agent, whose
     * context a huge result set would swamp, so its caps are tighter than the
     * action's and are held here rather than loosened for everyone.
     */
    max?: Record<string, number>;
    /**
     * Wrap the kernel's result. `get_contact` (and company/deal) attach
     * neighbour ids the other surfaces do not return.
     */
    map?: (
      out: unknown,
      args: Record<string, unknown>,
      ctx: { workspaceId: string; role: string; userId: string | null; via?: string },
    ) => unknown | Promise<unknown>;
  } = {},
): McpTool {
  recordBinding("mcp", action.name);
  // The in-app agent reads the same tool list, so becoming a tool is also what
  // makes an action reachable from the AI surface.
  recordBinding("ai", action.name);
  const schema = toJsonSchema(action.input);
  return {
    name: opts.name ?? action.name.replace(".", "_"),
    description: opts.description ?? action.description,
    inputSchema: applyNaming(schema, opts.rename, opts.defaults, opts.max),
    // Reads run inline for the AI agent; writes are proposed and confirmed.
    mutates: action.verb !== "read",
    handler: async (args, ctx) => {
      const out = await execute(action, clamp({ ...opts.defaults, ...translate(args, opts.rename) }, opts.max), {
        ...ctx,
        // Everything reaching a tool is agent-initiated; the AI chat marks its
        // own calls "ai" and anything else is a plain MCP client.
        via: ctx.via ?? "mcp",
      });
      return opts.map ? opts.map(out, args, ctx) : out;
    },
  };
}

/** Rewrite the tool's argument names to the action's. */
function translate(args: Record<string, unknown>, rename?: Record<string, string>): Record<string, unknown> {
  if (!rename) return args;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) out[rename[key] ?? key] = value;
  return out;
}

/** Hold a numeric argument to this tool's own ceiling. */
function clamp(args: Record<string, unknown>, max?: Record<string, number>): Record<string, unknown> {
  if (!max) return args;
  const out = { ...args };
  for (const [key, ceiling] of Object.entries(max)) {
    const value = Number(out[key]);
    if (Number.isFinite(value) && value > ceiling) out[key] = ceiling;
  }
  return out;
}

/** Advertise the tool's own argument names, defaults and ceilings. */
function applyNaming(
  schema: Record<string, unknown>,
  rename?: Record<string, string>,
  defaults?: Record<string, unknown>,
  max?: Record<string, number>,
): Record<string, unknown> {
  if (!rename && !defaults && !max) return schema;
  const reverse = Object.fromEntries(Object.entries(rename ?? {}).map(([tool, act]) => [act, tool]));
  const properties: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(schema.properties as Record<string, unknown>)) {
    const name = reverse[key] ?? key;
    properties[name] = {
      ...(spec as object),
      ...(defaults && name in defaults ? { default: defaults[name] } : {}),
      ...(max && name in max ? { maximum: max[name] } : {}),
    };
  }
  const required = (schema.required as string[] | undefined)?.map((f) => reverse[f] ?? f);
  return { ...schema, properties, ...(required ? { required } : {}) };
}
