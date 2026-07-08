import { createInterface } from "node:readline";
import { and, eq, isNull } from "drizzle-orm";
import { db, tables } from "@/db";
import { sha256 } from "@/lib/auth";
import { handleMcpRequest, type JsonRpcRequest } from "./server";
import type { ToolContext } from "./tools";

/**
 * Stdio transport for the Fourty MCP server (Gate B6/D). Authenticates once with a
 * Fourty API key (env FOURTY_API_KEY), resolving its workspace + role, then serves
 * newline-delimited JSON-RPC on stdin/stdout — the framing MCP clients (Claude
 * Desktop/Code, Cursor) speak for a self-hosted stdio server. Run: `npm run mcp`.
 */
async function resolveContext(apiKey: string): Promise<ToolContext> {
  const row = (
    await db
      .select({ workspaceId: tables.apiKeys.workspaceId, role: tables.apiKeys.role })
      .from(tables.apiKeys)
      .where(and(eq(tables.apiKeys.keyHash, sha256(apiKey)), isNull(tables.apiKeys.revokedAt)))
      .limit(1)
  )[0];
  if (!row) throw new Error("Invalid FOURTY_API_KEY");
  return { workspaceId: row.workspaceId, role: row.role, userId: null };
}

async function main() {
  const apiKey = process.env.FOURTY_API_KEY;
  if (!apiKey) {
    console.error("FOURTY_API_KEY is required to start the Fourty MCP server");
    process.exit(1);
  }
  const ctx = await resolveContext(apiKey);
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed);
    } catch {
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n",
      );
      continue;
    }
    const res = await handleMcpRequest(req, ctx);
    if (res) process.stdout.write(JSON.stringify(res) + "\n");
  }
}

main().catch((err) => {
  console.error("MCP server failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
