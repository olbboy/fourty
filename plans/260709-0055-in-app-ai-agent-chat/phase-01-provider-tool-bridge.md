---
phase: 1
title: "Provider & Tool Bridge"
status: done
priority: P1
dependencies: []
effort: "M"
---

# Phase 1: Provider & Tool Bridge

## Overview

BYO OpenAI-compatible LLM client via hand-rolled `fetch` (no SDK), plus the bridge that turns the
existing `TOOLS` into the provider's `tools` schema. Pure + unit-testable with a mocked `fetch` —
no DB, no UI, no live endpoint. This is the highest-risk parsing work (R1), so it goes first.

## Requirements

- Functional: config from env; `isAiEnabled()`; `streamChat({messages, tools})` async generator that yields text deltas + assembled tool-calls; `toProviderTools(TOOLS)` bridge; `mutates` flag on every tool.
- Non-functional: zero new npm deps; one request shape covers OpenAI/Groq/OpenRouter/Ollama/LM Studio; graceful when key unset or `tool_calls` unsupported.

## Architecture

- Env (read once): `AI_BASE_URL` (default `https://api.openai.com/v1`), `AI_API_KEY`, `AI_MODEL` (default `gpt-4o-mini`), `AI_MAX_TOKENS` (default `1024`). `isAiEnabled()` = `!!AI_API_KEY`.
- `streamChat` POSTs `${AI_BASE_URL}/chat/completions` with `{ model, messages, tools, tool_choice: "auto", stream: true, max_tokens: AI_MAX_TOKENS }`, `Authorization: Bearer ${AI_API_KEY}`. **`max_tokens` is mandatory (RT-E)** — never send an uncapped completion.
- Parse the response body stream: split on `\n\n`, strip `data: ` prefix, ignore `data: [DONE]`, `JSON.parse` each event.
  - `choices[0].delta.content` → yield `{ type: "text", delta }`.
  - `choices[0].delta.tool_calls[]` → accumulate by `.index` into a map: concat `.function.arguments` fragments, capture `.id` + `.function.name` from the first fragment.
  - On `finish_reason` (`tool_calls` | `stop`) → `JSON.parse` each accumulated `arguments`, yield `{ type: "tool_calls", calls: [{ id, name, arguments }] }` (if any) then `{ type: "done", finishReason }`.
- Tool bridge: `TOOLS.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }))`.
- **`streamChat` is a standalone exported function** (not a class/singleton) so the agent can receive it by injection and tests never stub global `fetch` at the agent layer <!-- Updated: Validation Session 1 - provider injectable -->. Provider variance is handled by **degrading gracefully**: if a model never emits `tool_calls` (some local models), the agent still works as a text-only assistant <!-- Updated: Validation Session 1 - document matrix + degrade -->.
- `mutates` flag: extend the `Tool` type in `src/mcp/tools.ts`; set `false` for reads (`search`, `list_*`, `get_dashboard_stats`, `list_custom_objects`, `list_records`) and `true` for writes (`create_contact`, `create_company`, `create_record`). MCP is unaffected (it ignores the flag).
- **`via` on `ToolContext` (RT-A):** add `via?: string` to `type ToolContext`, and change the three hardcoded `meta: { via: "mcp" }` audit calls (`src/mcp/tools.ts:159,206,278`) to `meta: { via: ctx.via ?? "mcp" }`. MCP passes nothing (→ `"mcp"`); the agent passes `via: "ai"` via ctx. This makes the tool's **own** audit row correct, so the agent must **not** fire a second `audit()` (see Phase 3 RT-A). Verify `tests/mcp.test.ts` still records `via: "mcp"`.

## Related Code Files

- Create: `src/lib/ai/provider.ts` (env, `isAiEnabled`, `streamChat`, provider event types)
- Create: `src/lib/ai/tool-bridge.ts` (`toProviderTools`) — or co-locate in `provider.ts` if it stays < ~40 LOC (KISS)
- Modify: `src/mcp/tools.ts` — add `mutates: boolean` to `type Tool` + each of the 10 tools; add `via?: string` to `type ToolContext`; swap the 3 hardcoded `via: "mcp"` for `via: ctx.via ?? "mcp"`
- Create (tests): `tests/ai-provider.test.ts`
- Modify: `.env.example` — add `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` / `AI_MAX_TOKENS` / `AI_RATELIMIT_PER_HOUR` (default `60`, RT-E) with an "optional; AI disabled when unset" comment

## Implementation Steps (TDD)

1. **RED** — `tests/ai-provider.test.ts`:
   - `isAiEnabled()` reflects `AI_API_KEY` presence.
   - `streamChat` with a mocked `fetch` (ReadableStream of canned `data:` chunks): yields ordered text deltas; reconstructs a **fragmented** tool-call (arguments split across ≥3 chunks, out-of-order indices) into one `{id,name,arguments}` with valid parsed JSON.
   - Two concurrent tool-calls (index 0 and 1) reconstructed independently.
   - `[DONE]` and heartbeat/empty lines ignored; malformed JSON line does not crash the generator.
   - `toProviderTools(TOOLS)` shape correct; every write tool has `mutates === true`, every read `false`.
2. **GREEN** — implement `provider.ts` + bridge + `mutates` flag until green.
3. Confirm no new dependency added to `package.json`.

## Success Criteria

- [ ] `tests/ai-provider.test.ts` green, including the fragmented + interleaved tool-call cases.
- [ ] `mutates` set on all 10 tools; `ToolContext.via` wired so `ctx.via ?? "mcp"` is used; existing `tests/mcp.test.ts` still green and still records `via: "mcp"` (RT-A).
- [ ] `streamChat` request always includes `max_tokens` from `AI_MAX_TOKENS` (RT-E).
- [ ] `npm run build` type-checks; no new runtime dependency.
- [ ] `.env.example` documents the three AI vars as optional.

## Risk Assessment

- **R1 (primary):** OpenAI streams tool-call args as fragments keyed by `index`; providers differ on chunk boundaries. Mitigation: index-keyed accumulator + tests with adversarial fragmentation. Treat `arguments === ""` as `{}`.
- Provider variance: if a chunk has no `tool_calls` field (plain text model), path still works (yields text only). Document behavior when `finish_reason` never signals tool_calls.
