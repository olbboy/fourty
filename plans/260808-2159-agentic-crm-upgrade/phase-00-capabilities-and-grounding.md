# Phase 0 — Capability registry, prompt grounding, non-dead-end reads

**Size:** S · **Depends on:** — · **Blocks:** everything else · **Status:** done (2026-08-09)

## Delivered

`src/lib/capabilities.ts` (registry + probes + pure renderers + `unavailable()`),
`GET/PATCH /api/diagnostics`, Settings → Diagnostics, grounded system prompt,
`get_contact`/`get_company`/`get_deal` with neighbour ids, prefix-only `search`,
boot-time module log. Tests: `tests/capabilities.test.ts` (16),
`tests/mcp-neighbours.test.ts` (11). Full suite 434 passed, build green.

Two deviations from the plan below, both deliberate:

- **`capabilities()` takes no `workspaceId`.** It reads the ambient
  `withWorkspace()` transaction and throws outside one. Taking an id would mean
  opening a second transaction inside an already-open request. Same reason there
  is no per-request cache: it is three small queries with one call site per
  request, and a cache would only add staleness.
- **`WEBHOOKS` is configured from Automations, not "Settings → Webhooks"** —
  there is no such panel. Outbound webhooks are a workflow action, so the probe
  is "an enabled workflow with a webhook action". Settings → Webhooks holds only
  the signing secret.

The identity line needed a write path or it would have been an unreachable
settings key, so Diagnostics owns a 320-char input and `PATCH /api/diagnostics`
(admin-only, audited) rather than the read-only panel the plan described.

## Why

Two concrete defects today, both cheap:

1. `src/lib/ai/prompt.ts` tells the model its role and nothing about *this install*. It does not know whether a mailbox is connected, whether custom objects exist, or who "we" are. It therefore plans around sources that are not there and gets a thrown error instead of "that is not configured here".
2. `src/mcp/tools.ts` exposes `list_*` / `create_*` but no read that hands back neighbouring ids. An assistant that has a company can't walk to its contacts without a second search, and a search that misses ends the conversation in "please paste the email".

## Requirements

- One module knows what this workspace can reach. The **module registration** is logged once at boot; per-workspace **status** is rendered into the system prompt and exposed read-only in Settings → Diagnostics. The process never holds one global boolean.
- A tool for an unconfigured capability returns a structured *not configured, retrying will not help* result. It never throws and never counts as a failure.
- Every read tool returns the ids of adjacent records.
- A workspace identity block ("who we are") precedes the capability block in every prompt.

## Files

**Create**
- `src/lib/capabilities.ts` — `capabilities(workspaceId)`, `capabilitiesMarkdown()`, `unavailable(id)`, `logCapabilities()`. Pure renderer split from the async reader so it is testable without a DB.
- `src/app/(app)/settings/sections/diagnostics.tsx` — read-only on/off list with where each is configured from.
- `tests/capabilities.test.ts`, `tests/mcp-neighbours.test.ts`.

**Modify**
- `src/lib/ai/prompt.ts` — add the workspace block + capability block; keep the injection-hardening line.
- `src/mcp/tools.ts` — add `get_contact`, `get_company`, `get_deal` returning the record plus neighbour ids; make `search` explicitly non-fuzzy (exact/prefix only) and document why.
- `src/app/(app)/settings/settings-client.tsx` — mount the panel.
- `src/instrumentation.ts` — log *module registration* once at boot. Capabilities are **per-workspace** rows (`MAILBOX` = a `sync_accounts` row, workspace-scoped), so the process must not pretend one boolean; per-workspace status lives in Settings → Diagnostics only.
- `docs/guides/ai-assistant.md` — document the capability list.

## Capability list (v1)

| id | Label | Configured from | Gives |
|---|---|---|---|
| `AI_PROVIDER` | AI assistant | env (BYO key) | The chat and any model-backed pass |
| `MAILBOX` | Mailbox sync | Settings → Mailboxes (a connected `sync_accounts` row) | Threads, replies and signature blocks — the best identity evidence there is |
| `CALENDAR` | Calendar | Settings → Mailboxes (ICS feed / OAuth) | Meeting attendance |
| `WEBHOOKS` | Outbound webhooks | Settings → Webhooks | Notifying other systems |
| `CUSTOM_OBJECTS` | Custom objects | Settings → Custom objects | Extra record types the agent may read |

`MAILBOX`/`CALENDAR` are per-workspace **rows**, not env vars — a self-hoster's admin must not need a redeploy to change what the agent can see. Cache per request; never throw on a read failure (log + report the capability as off).

## Steps

1. Write `capabilities.ts` with the pure/async split. `unavailable()` returns `{ ok: false, configured: false, reason }` — one shared sentence, checked before any work is done.
2. Prompt: prepend a ≤320-char workspace identity block (name + what we sell, from `settings`) then the capability markdown. When nothing is configured, say so positively: *everything you can learn is already in the CRM*.
3. MCP/AI reads: `get_contact` → company id, deal ids, colleague ids; `get_company` → contact ids, deal ids; `get_deal` → stage clock, contact ids, company id. Field-permission filtering applies exactly as it does on the existing reads.
4. `search`: exact + prefix only. A near-miss returns nothing, with a note that it is not fuzzy. Test the "Marchetti ≠ Marchetta" case.
5. Diagnostics panel: on/off + where-from, admin-visible, no secrets rendered.

## Validation

- `npm test -- capabilities mcp-neighbours` first, then the full `npm test`.
- Every read tool result carries at least one neighbour id where a neighbour exists (table-driven test over the tool list).
- `npm run build`.

## Risks

- **Prompt bloat** — cap the workspace block at 320 chars, enforced at the write path, not by convention.
- **Leaking config** — Diagnostics renders booleans and labels only; never a key, never a redacted key.
