---
phase: 2
title: "Persistence & RLS"
status: done
priority: P1
dependencies: []
effort: "M"
---

# Phase 2: Persistence & RLS

## Overview

Two workspace-scoped tables — `ai_conversations` and `ai_messages` — plus a reversible migration
(up + hand-written down) with RLS policies identical to every other tenant table, and a thin store
module. Provable cross-workspace isolation is the acceptance bar.

## Requirements

- Functional: create/get/list conversations; append/read messages preserving role + `tool_calls` + `tool_call_id` + `status`; message shape round-trips into provider message shapes (Phase 3 consumer).
- Non-functional: RLS `FORCE`d, workspace-scoped; follows existing schema/migration conventions (`workspaceId()` col, `millis()` timestamps, `text` id via `newId()`, text-JSON columns); reversible down migration.

## Architecture

- `ai_conversations`: `id` (text PK), `workspaceId()`, `userId` (text, nullable), `title` (text, nullable), `createdAt`/`updatedAt` (`millis`). Index on `(workspaceId, updatedAt)`.
- `ai_messages`: `id` (text PK), `workspaceId()`, `conversationId` (text, **real FK** `REFERENCES ai_conversations(id) ON DELETE CASCADE` — RLS + FK coexist; RT-K), `role` (`user` | `assistant` | `tool`), `content` (text, default `''`), `toolCalls` (text nullable — JSON of `[{id,name,arguments}]`), `toolCallId` (text nullable — for `role: tool`), `status` (`complete` | `pending_confirmation` | `executing` | `rejected`, default `complete`), `createdAt` (`millis`). Index on `(workspaceId, conversationId, createdAt)`. Note the extra `executing` state used by the atomic claim (RT-B).
- **`ai_conversations.userId` is the ownership key (RT-C).** It is NOT nullable for chat-created rows; every store read/act is scoped by `(workspaceId, userId)`, not workspace alone — RLS isolates tenants, but per-user ACL must be enforced in the store/route because workspace-mates share a workspace.
- Migration `drizzle/0011_ai_chat.sql`: `CREATE TABLE` both, then per table:
  `ALTER TABLE "…" ENABLE ROW LEVEL SECURITY;` · `FORCE ROW LEVEL SECURITY;` ·
  `CREATE POLICY "…_tenant" ON "…" USING (workspace_id = current_setting('app.workspace_id', true)) WITH CHECK (workspace_id = current_setting('app.workspace_id', true));`
  (`fourty_app` inherits DML; `workspace_id` defaults to `current_setting('app.workspace_id', true)`.)
- Down `drizzle/down/0011_ai_chat.down.sql`: `DROP POLICY` + `DROP TABLE` both (reverse order).
- Store `src/lib/ai/store.ts` (all run **inside** a `withWorkspace()` scope, like `src/lib/custom-objects.ts` helpers) — **every reader/mutator takes `userId` and scopes by `(workspaceId implicit via RLS, userId)`; a mismatch returns null/none, never another user's data (RT-C):**
  - `createConversationWithFirstMessage(userId, firstMsg)` — creates the conversation **and** appends the first message in **one** `withWorkspace` call so there is no orphan window (RT-K). Returns `{ conversationId }`.
  - `getConversation(id, userId)` / `listMessages(conversationId, userId)` — return nothing if the conversation's `userId` ≠ caller.
  - `appendMessage(msg)`.
  - `getPendingMessage(id, userId)` — returns the persisted `{ toolCalls, status }` for a `pending_confirmation` message owned by `userId`; the approve path executes **only** from this server-persisted `toolCalls`, never from the client decision body (RT-D).
  - `claimPendingMessage(id, userId)` — **atomic CAS** `UPDATE ai_messages SET status='executing' WHERE id=$1 AND status='pending_confirmation' AND <owned by userId> RETURNING tool_calls`; returns null if already claimed. Guarantees a proposal executes at most once even under concurrent/replayed confirms (RT-B). `setMessageStatus(id, 'complete'|'rejected')` finalizes.
  - `hasUnresolvedPending(conversationId, userId)` — used by the route to reject a new user message while a write is awaiting confirmation (RT-F).

## Related Code Files

- Modify: `src/db/schema.ts` — add `aiConversations`, `aiMessages` (+ export via `tables`)
- Create: `drizzle/0011_ai_chat.sql` (generate with `npm run db:generate`, then hand-add RLS enable/force/policy lines)
- Create: `drizzle/down/0011_ai_chat.down.sql`
- Create: `src/lib/ai/store.ts`
- Create (tests): `tests/ai-store.test.ts`
- Reference (do not edit): `drizzle/0006_custom_objects.sql` (RLS block to copy), `tests/mcp.test.ts` (harness), `tests/tenant-isolation.test.ts` (isolation pattern), `tests/migration-reversibility.test.ts` (down coverage)

## Implementation Steps (TDD)

1. **RED** — `tests/ai-store.test.ts` (mirror `mcp.test.ts` setup: `resetDb`, two workspaces A/B, two users U1/U2 in workspace A):
   - `createConversationWithFirstMessage` + `appendMessage`; `listMessages(id, U1)` returns them ordered, fields intact; no orphan window (RT-K).
   - `claimPendingMessage` returns `toolCalls` on the **first** call and `null` on a concurrent/second call for the same id (atomic CAS, RT-B); `setMessageStatus` then finalizes.
   - `getPendingMessage(id, U1)` returns persisted `toolCalls`; the approve path must use these, not client input (RT-D).
   - **Tenant isolation:** workspace B cannot read A's conversation/messages (RLS returns none).
   - **Per-user isolation (RT-C):** in the same workspace A, `getConversation`/`listMessages`/`getPendingMessage`/`claimPendingMessage` called with U2 against U1's conversation return null/none.
   - `hasUnresolvedPending` true while a `pending_confirmation` exists, false after finalize (RT-F).
2. Add tables to `schema.ts`; `npm run db:generate`; hand-edit `0011_ai_chat.sql` to add `ENABLE`/`FORCE`/`CREATE POLICY` for both tables; write the `.down.sql`.
3. Implement `store.ts`; **GREEN**.
4. **Extend `tests/migration-reversibility.test.ts` — this is easy to forget and fails silently (RT-J).** The test hardcodes `UP`/`DOWN` file arrays (currently ending at `0010_sso_oidc`) and schema-fingerprint counts `expect(...tables).toBe(30)` and `expect(...policies).toBe(23)` (lines ~93,106 / ~94,107). You MUST: (a) add `drizzle/0011_ai_chat.sql` to `UP` and `drizzle/down/0011_ai_chat.down.sql` to `DOWN`; (b) bump `tables` `30 → 32` (two new tables) and `policies` `23 → 25` (two new `*_tenant` policies) in **both** the `up1` and `up2` assertion blocks. Grep-verify `0011` literally appears in the test before merge — a green suite without it means the down migration is untested.

## Success Criteria

- [ ] `tests/ai-store.test.ts` green, including cross-workspace **and** cross-user isolation (RT-C), atomic single-claim (RT-B), and no-orphan create (RT-K).
- [ ] `0011_ai_chat.sql` applies on a clean DB; `.down.sql` drops cleanly; `0011` is present in `tests/migration-reversibility.test.ts` `UP`/`DOWN` arrays and the `tables`/`policies` counts are bumped to 32/25 (RT-J).
- [ ] Both tables have `FORCE ROW LEVEL SECURITY` + a `*_tenant` policy (grep-verifiable); `ai_messages.conversationId` has a real FK to `ai_conversations` (RT-K).
- [ ] `npm run build` green; no schema drift (`db:generate` produces no further diff).

## Risk Assessment

- **R4:** message columns must faithfully carry provider-shape data (`toolCalls` JSON, `toolCallId`). Mitigation: store test asserts exact reconstruct; Phase 3 asserts the provider-message mapping.
- RLS regression: forgetting `FORCE` would let the owner bypass. Mitigation: copy the exact 3-line block from `0006`; isolation test is the guard.
