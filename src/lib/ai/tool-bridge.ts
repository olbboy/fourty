import { TOOLS, type Tool } from "@/mcp/tools";
import type { ProviderTool } from "./provider";

/**
 * Bridge the existing MCP `TOOLS` into the provider's function-calling schema.
 * `TOOLS` is the single source of truth for both MCP and the agent — the agent
 * never forks a second tool list. The `mutates` flag stays server-side (it drives
 * read-inline vs propose-and-stop) and is intentionally not sent to the provider.
 */
export function toProviderTools(tools: Tool[] = TOOLS): ProviderTool[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}
