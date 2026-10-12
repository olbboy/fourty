---
phase: 1
title: "Agent tab on custom objects"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Agent tab on custom objects

## Overview

Put the same **Timeline | Agent** switch on `/objects/{apiName}/{id}` that contacts/companies/deals already have. Bind the thread to `entityType=apiName`. Ground the model with label + `data` facts + pinned work ids. No migration.

## Context Links

- Brainstorm: `plans/reports/brainstorm-260901-0228-crm-ai-parity.md`
- Docs today: `docs/guides/ai-assistant.md` (CRM-only Agent tab), `docs/guides/custom-objects.md` (notes/tasks/timeline only)

## Key Insights

- `RECORD_ENTITIES` is a 3-value union. Chat/conversation routes use `isRecordEntity` as a **sync** type guard. Custom apiNames cannot join that union.
- `ai_conversations.entityType` is unconstrained `text` — bind `apiName` as-is.
- Field-permissions (ADR-011) do **not** apply to custom objects. Gate with object-level `objects` RBAC.
- `recordTitle()` lives in `src/app/(app)/objects/[apiName]/shared.ts`. Server code in `src/lib` must not import from App Router. Lift the helper.
- Custom detail already has Timeline/Notes/Tasks **without** `RecordTabs`. Contacts replace the standalone Timeline with `RecordTabs`.

## Requirements

- Functional: Agent tab on custom-object detail; `GET /api/ai/conversations` + `POST /api/ai/chat` accept `entityType=apiName` when `objectByApiName` hits; `loadRecordContext` returns label + compact `data` facts + `taskIds`/`noteIds`/`activityIds`; missing or forbidden record → same 404 as CRM.
- Non-functional: no DDL; no facts/suggestions on custom objects; existing CRM Agent tab unchanged.

## Architecture

Keep CRM entities as a closed enum. Add an async bindable check for custom objects.

```ts
export const CRM_RECORD_ENTITIES = ["contact", "company", "deal"] as const;
export type CrmRecordEntity = (typeof CRM_RECORD_ENTITIES)[number];

export function isCrmRecordEntity(v: unknown): v is CrmRecordEntity { /* includes */ }

export function permissionObjectFor(entity: string): string {
  return isCrmRecordEntity(entity) ? PERM_OBJECT[entity] : "objects";
}

export async function resolveBindableEntity(value: string): Promise<string | null> {
  if (isCrmRecordEntity(value)) return value;
  const obj = await objectByApiName(value);
  return obj ? obj.apiName : null; // canonical apiName, not the raw string
}
```

`loadRecordContext(entityType, entityId, role)`:

1. If CRM enum → existing contact/company/deal paths (field policy stays).
2. Else `objectByApiName` + `can(role, "objects", "read")` + `getRecord` + `fieldsOf`. Label = `recordTitle(data, fields, "Untitled")`. Facts = compact `label: value` lines from `data` (skip empty). Neighbours = `pinnedWorkIds(apiName, id)` only (no company/deal graph).
3. Missing object, missing row, or denied role → `null`.

Routes — **no `POST /api/ai/conversations`**. Replace every `isRecordEntity(...)` (5 sites) with `await resolveBindableEntity(...)`:

- `src/app/api/ai/chat/route.ts` — `parseRecord` (new-thread binding), existing-conversation gate, `loadRecordContext` gate. If `parseRecord` stays CRM-only, a custom Agent tab chats **ungrounded** (binding null, no 404).
- `src/app/api/ai/conversations/route.ts` — GET list. 400 message: entityType must be contact|company|deal **or a custom-object apiName**.
- `src/app/api/ai/conversations/[id]/route.ts` — if bindable custom, `authorize(auth, "objects", "read")`. Today non-CRM `entityType` skips the role check.

Also add singular `contact`, `company`, `deal` to `RESERVED` in `src/app/api/custom-objects/route.ts` (plurals already there). `<!-- Updated: Validation Session 1 - no conversations POST; RESERVED singular -->`

UI: widen `RecordTabs` / `AgentPanel` `entityType` to `string`. Custom `record-detail.tsx` wraps Timeline in `RecordTabs` like `contact-detail.tsx` (keep Notes/Tasks cards).

## Related Code Files

- Modify: `src/lib/ai/record-context.ts`
- Modify: `src/lib/custom-objects.ts` (export `recordTitle`, or add next to `shape`)
- Modify: `src/app/(app)/objects/[apiName]/shared.ts` (re-export `recordTitle` so client import path stays)
- Modify: `src/app/api/ai/chat/route.ts` (`parseRecord` + two `isRecordEntity` gates; 404 when bound record is null)
- Modify: `src/app/api/ai/conversations/route.ts` (**GET only** — there is no POST)
- Modify: `src/app/api/ai/conversations/[id]/route.ts` (authorize `objects` for custom apiName; today custom threads skip the role check)
- Modify: `src/app/api/custom-objects/route.ts` (`RESERVED` add `contact`, `company`, `deal`)
- Modify: `tests/custom-objects.test.ts` (assert singular names 409)
- Modify: `src/components/agent-panel/record-tabs.tsx`
- Modify: `src/components/agent-panel/index.tsx`
- Modify: `src/app/(app)/objects/[apiName]/[id]/record-detail.tsx`
- Modify: `tests/record-context.test.ts`
- Modify (docs in this phase, product copy): `docs/guides/ai-assistant.md`, `docs/guides/custom-objects.md` — or defer both to phase 5 if you want one docs pass. Prefer **update here** so the UI does not ship against stale guides; phase 5 re-reads.
- Create: none required. Optional focused test `tests/record-context-custom.test.ts` if the existing file is already large.

## Implementation Steps

1. Lift `recordTitle` into `src/lib/custom-objects.ts` (same semantics: first text field else first field else `"Untitled"`). Re-export from `shared.ts`.
2. Split `isRecordEntity` into `isCrmRecordEntity` + `resolveBindableEntity`. Keep `RECORD_ENTITIES` export if tests/callers use it — alias to CRM list or update callers.
3. Implement `customObjectContext` in `loadRecordContext`. Cap facts (e.g. first 12 non-empty fields) so a wide object does not blow the prompt.
4. Switch the five `isRecordEntity` sites to `resolveBindableEntity`. Preserve 404 for null context (do not distinguish missing vs forbidden).
5. Add `contact`, `company`, `deal` to `RESERVED`; test 409 on POST `/api/custom-objects`.
6. Widen Agent panel types to `string`. Mount `RecordTabs` on custom record detail.
7. Tests: existing CRM `loadRecordContext` still passes. New case: insert a custom object + record + pinned task; context label matches `recordTitle`; neighbours include `taskIds`; other workspace / viewer-without-objects / unknown apiName → null. Chat `parseRecord` accepts apiName; garbage entityType does not bind.
8. Browser: open a custom record, switch Agent, send a message (needs AI key). If no key, tab still renders and conversation GET works.

## Todo

- [x] Lift `recordTitle` to lib; re-export from App Router `shared.ts`
- [x] Bindable entity resolver + `objects` permission for custom
- [x] `loadRecordContext` custom-object branch
- [x] Five `isRecordEntity` sites accept apiName (chat ×3, conversations GET, conversations/[id])
- [x] RESERVED includes singular `contact|company|deal` (409 + test)
- [x] `RecordTabs` on custom record detail
- [x] Vitest: record-context custom object + 404/cross-workspace
- [x] Docs: Agent tab includes custom objects

## Success Criteria

- [x] `/objects/{apiName}/{id}` shows Timeline | Agent
- [x] Thread `entityType` is the object's apiName
- [x] Grounding markdown has label, data facts, pinned ids
- [x] CRM Agent tab still works
- [x] `npx vitest run tests/record-context.test.ts` green on `:5439`

## Risk Assessment

- **Sync type-guard callers miss the async change.** Signal: tsc error or 400 on custom Agent. Response: grep `isRecordEntity` / `RecordEntity` and update every call site in this phase.
- **App→lib import cycle if `recordTitle` stays in `app/`.** Signal: tsc cycle. Response: lift to `custom-objects.ts` only.
- **Prompt injection via custom field values.** Existing `recordMarkdown` already says field values are data. Keep that sentence. Do not splice `data` into the user message.
- **Reserved apiNames colliding with CRM.** Plurals are already reserved. Singular `contact|company|deal` were legal — **now reserved** (validation session 1). CRM enum still wins first if a legacy row exists; do not add a migration to rename them.

## Security Considerations

- Same 404 for missing and forbidden (no existence leak).
- Custom path uses `objects` RBAC, not field-permissions.
- RLS via `withWorkspace()` already on the AI routes.

## Next Steps

Phase 2 (reportStats). Agent tab does not depend on search or pipelines.
