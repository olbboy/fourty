import { toProviderTools } from "@/lib/ai/tool-bridge";
import type { ProviderTool } from "@/lib/ai/provider";
import { toMcpTool } from "./mcp";
import type { ActionDef } from "../types";

/**
 * Serve an action to the in-app AI agent. The agent reads the same tool list as
 * MCP — this goes through `toMcpTool` and the existing bridge rather than
 * building a second description, so the agent can never see a tool surface the
 * MCP clients do not.
 *
 * `mutates` deliberately does not reach the provider: it stays server-side,
 * where it decides whether a call runs inline or is proposed for confirmation
 * (ADR-015).
 */
export function toProviderTool<I, O>(action: ActionDef<I, O>): ProviderTool {
  return toProviderTools([toMcpTool(action)])[0];
}
