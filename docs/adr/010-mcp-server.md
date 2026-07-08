# ADR-010 — Native MCP server

**Status:** Accepted · **Date:** 2026-07-08

## Context
Twenty ships a native MCP server so LLM clients (Claude, ChatGPT, Cursor) can
read and write the CRM. This is the headline AI-native gap for Fourty. We want a
self-hostable MCP server that reuses Fourty's tenancy + RBAC and adds no heavy
dependency.

## Decision
**Hand-rolled MCP JSON-RPC over stdio — no SDK.**

- `src/mcp/server.ts` implements the MCP subset a client needs: `initialize`,
  `tools/list`, `tools/call`, `ping`, and notification handling. It is **pure
  request → response**, so it is directly unit-testable without spawning a process.
- Each `tools/call` runs inside `withWorkspace()` so **Postgres RLS scopes it** to
  the authenticated key's workspace, and each tool checks **RBAC via `can()`** —
  a viewer key can read but not create. Tool handlers reuse the same helpers as
  REST/GraphQL (validators, custom-object store, stats service), so behavior can't
  drift.
- `src/mcp/stdio.ts` is the transport: it authenticates **once** with a Fourty API
  key (`FOURTY_API_KEY`), resolves its workspace + role, then serves
  **newline-delimited JSON-RPC** on stdin/stdout — the framing self-hosted MCP
  clients speak. Run with `npm run mcp`.
- Ten tools: `search`, list/create contacts + companies, list deals,
  `get_dashboard_stats`, and list/create custom-object records.

### Why no `@modelcontextprotocol/sdk`?
The stdio JSON-RPC surface Fourty needs is ~120 lines. Hand-rolling keeps the
dependency footprint at zero and the protocol legible, consistent with the queue
(pg-boss, no Redis) and GraphQL (reference package) choices.

## Consequences
- Tool errors return an `isError` content block (per MCP), not a protocol error,
  so a client sees a readable message.
- Auth is per-key: the server acts entirely within one workspace at the key's
  role. Multi-workspace or per-user MCP auth is out of scope for this tier.
- Verified end-to-end over real stdio against Postgres, plus `tests/mcp.test.ts`.
