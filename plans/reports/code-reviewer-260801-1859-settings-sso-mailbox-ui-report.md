# Code Review: Settings UI for SSO connections + mailbox sync accounts

Range: `44267e9..HEAD` (cd0586f, 42a9001, dab125e, a716ecc). Fourty (Next.js + Postgres CRM).

## Scope
- New: `src/app/api/sync/accounts/[id]/route.ts` (PATCH+DELETE), `src/lib/sync/account-view.ts`
- Changed: `src/app/api/sync/accounts/route.ts` (uses shared redact), `src/lib/permissions.ts` (+`ROLES`)
- New UI: `src/app/(app)/settings/sections/{sso,mailbox}.tsx`, `settings-client.tsx` reduced to composition
- Moved: `sections/{members,api-keys,custom-fields,language}.tsx`
- Tests: `tests/sync.test.ts`, `tests/sso.test.ts`, `tests/a11y.test.ts`
- LOC: ~1985 added / ~468 removed across 22 files (incl. docs/plans)

Verification performed: read every changed file, ran the full narrow test set (`tests/sync.test.ts`, `tests/sso.test.ts`, `tests/a11y.test.ts`, `tests/permissions.test.ts`, `tests/api-auth.test.ts` — 62/62 pass), `tsc --noEmit` (clean), diffed the 4 "moved verbatim" panels against `cd0586f` (byte-identical except added `export`), confirmed `git diff --stat -- package.json` is empty, grepped the RLS migration (`drizzle/0007_email_calendar_sync.sql`) to confirm `sync_accounts`/`email_messages`/`calendar_events` have `FORCE ROW LEVEL SECURITY` + tenant policies, grepped all of `src/` for reads of `emailMessages`/`calendarEvents` outside the new route and `ingest.ts` (none found).

## Overall Assessment
Solid, scoped implementation. Backend gap (PATCH/DELETE) is correctly gated, audited, and RLS-safe; the DELETE cascade claim is verified true (nothing reads those tables back, `activities.meta` stores denormalized subject/from strings, not FKs to the deleted rows). The 4 moved panels are provably behavior-identical. Tests are real (exercise actual route handlers against Postgres, not mocks) and cover the stated RLS/RBAC/redaction/idempotency claims. No secrets reach the client in any code path checked. The one real defect is inconsistent error handling on secondary mutation buttons (pause/resume, enable/disable, delete) in both new panels — a correctness/UX gap the task's own acceptance criteria called out.

## Critical Issues
None found.

## High Priority
None found.

## Medium Priority

**1. Inconsistent error handling on mutating buttons — failures are silently swallowed.**
`src/app/(app)/settings/sections/mailbox.tsx:96-103` (`setStatus`, used by Pause/Resume) and `src/app/(app)/settings/sections/sso.tsx:79-93` (`toggle` for Enable/Disable, `remove` for Delete) fire the request and unconditionally call `load()`, without checking `res.ok`:

```ts
// mailbox.tsx:96
async function setStatus(a: SyncAccount, status: string) {
  await fetch(`/api/sync/accounts/${a.id}`, { method: "PATCH", ... });
  load(); // no res.ok check, no setError
}
```
```ts
// sso.tsx:88
async function remove(c: SsoConnection) {
  if (!confirm(...)) return;
  await fetch(`/api/sso/connections/${c.id}`, { method: "DELETE" }); // no res.ok check
  load();
}
```
Compare to `mailbox.tsx`'s own `create`/`remove`(mailbox) and `sso.tsx`'s own `save`, which do check `res.ok` and surface `error`. Concretely: a `viewer` role sees these buttons (mailbox panel is shown to everyone per its own comment at line 25), clicks Pause, gets a 403 from the API (verified: `tests/sync.test.ts` "denies a viewer both writes"), and the UI just silently reloads with no visible change and no error — indistinguishable from a no-op to the user. Same for a transient 500/network failure on any of these three actions. Not a security issue (the API is still the enforcement point, per the code's own comment), but it's a real gap against the task's explicit acceptance criterion "Error handling on failed fetches," and it's inconsistent within the same file.

Fix: mirror the existing pattern (`if (!res.ok) setError(...)`) in `setStatus`, `toggle`, and SSO's `remove`.

## Low Priority

**2. No submit-guard against double-click on "Add mailbox" / "Add provider."**
`mailbox.tsx` `create()` and `sso.tsx` `save()` don't disable the submit button or track an in-flight state, so a fast double-click can fire two POSTs. Pre-existing pattern in the untouched `CustomFieldsSection`/`MembersSection`, so not a regression introduced by this diff — flagging only because it's new surface area repeating the same gap. Not worth blocking on.

## Edge Cases Found by Scout (targeted, per the review brief's focus areas)

- **DELETE cascade safety (verified, not a bug):** `src/app/api/sync/accounts/[id]/route.ts:74-76` deletes `emailMessages`/`calendarEvents` by `accountId` before deleting the account, all inside the single transaction `withWorkspace` already opens (`src/db/index.ts:98-105`) — so the three deletes + audit write are atomic. Confirmed no code path in `src/` reads either table outside `ingest.ts` (writer) and this route (writer+reader). Confirmed `activities.meta` (the contact-timeline record) stores `{subject, from, messageId}`/event fields as plain JSON, not a foreign key into `emailMessages`/`calendarEvents`, so deleting those rows cannot orphan a timeline reference. `tests/sync.test.ts:528` exercises this end to end.
- **Cross-tenant deletion (verified safe):** the route filters only by `id` with no explicit `workspaceId` check in the query, relying entirely on Postgres RLS (`FORCE ROW LEVEL SECURITY` + `USING/WITH CHECK (workspace_id = current_setting(...))`, confirmed in `drizzle/0007_email_calendar_sync.sql`). `tests/sync.test.ts:604` ("hides another workspace's account from both writes (RLS)") proves a foreign workspace's admin gets 404, not silent no-op or leaked row. This matches the project's established tenancy pattern (ADR-001) — not a novel risk.
- **`enabled` int/boolean conversion (verified correct):** SSO row stores `enabled` as a Postgres integer; `sso.tsx` reads it as `number` (typed correctly, comment at line 15-16 flags it) and does `!c.enabled` when toggling, which correctly inverts 0/1 as JS truthiness. Server-side (`src/app/api/sso/connections/[id]/route.ts:58`, pre-existing, unchanged) coerces `d.enabled ? 1 : 0` on write and returns the raw integer column on read — the round-trip is consistent and pinned by `tests/sso.test.ts:424` ("sends `enabled` as the integer the column stores").
- **Empty-secret-doesn't-clear (verified correct):** `sso.tsx:59` only adds `clientSecret` to the PATCH body `if (secret)` (trimmed, non-empty). Backend `updateSchema` (`sso/connections/[id]/route.ts:33`) requires `min(1)` and the handler only patches fields present in the parsed body. `tests/sso.test.ts:429` ("leaves the secret alone when an update omits it") confirms this against Postgres.
- **`<a href>` vs fetch for OAuth connect (verified correct):** `mailbox.tsx:163` uses a real anchor tag, not a button+fetch, matching the stated PKCE-cookie requirement. `tests/sync.test.ts:356` confirms the connect route answers 302 + `Set-Cookie`.
- **Redaction allowlist (verified correct):** `src/lib/sync/account-view.ts:16-19` uses an explicit allowlist (`host`, `url`) rather than a denylist of secret keys — any new config key added later (e.g. a future `imapPassword`) is safe-by-default rather than needing to be remembered to exclude. Same pattern as the pre-existing `redactConnection` for SSO. No dead code left behind after extracting this from the collection route (diffed old vs. new inline `redact` — identical logic, just relocated).
- **XSS via server-controlled strings (checked, none found):** `a.lastError` (`mailbox.tsx:154`) and `c.label`/`c.issuer` (`sso.tsx`) are rendered as JSX text children; no `dangerouslySetInnerHTML` anywhere in either file (grepped). React's default escaping applies — not exploitable.
- **Moved-panel behavior identity (verified):** diffed `MembersSection`/`ApiKeysSection`/`CustomFieldsSection`/`LanguageSection` bodies from `git show cd0586f:.../settings-client.tsx` against the new per-file versions — byte-identical apart from the added `export` keyword.
- **Public-contract claim (verified):** `git diff 44267e9..HEAD` touches nothing under GraphQL SDL, MCP tool definitions, or `src/lib/actions/`. `git diff --stat -- package.json` is empty — no new runtime dependency.
- **Pre-existing, documented, out-of-scope observation (not a defect in this diff):** SSO connections are instance-global, not workspace-scoped (`docs/adr/014-sso-oidc.md:46-49`, explicitly states "any workspace admin can manage SSO for the whole instance — a known limitation, stated honestly"). This diff doesn't touch `src/app/api/sso/connections*` (confirmed via `git diff` and `git log` on that path — last touched in `25cb2bb`, well before this range) and doesn't change that exposure; it only adds a UI on top of an already-accepted architecture. Noting for completeness per the review brief's threat-model instruction, not flagging as a finding — a previously-verified decision, not something to relitigate without new evidence.

## Positive Observations
- Tests are real: they exercise actual route handlers against a live Postgres instance with RLS active (not mocked), and specifically assert the negative cases (403 for viewer, 404 for cross-workspace, secret never in response body via `expect(body).not.toContain(...)` on the raw text, not just the parsed JSON).
- Comments throughout the new route/redaction code state *why*, not just *what* (e.g. the reasoning for cascading the ingest tables, the reasoning for rejecting client-set `status: "error"`).

## Recommended Actions
1. Add `if (!res.ok) setError(...)` (or equivalent) to `mailbox.tsx`'s `setStatus` and `sso.tsx`'s `toggle`/`remove`, matching the pattern already used elsewhere in the same files.
2. Optional/non-blocking: disable submit buttons while a create request is in flight in both new panels, consistent with (not worse than) the pre-existing panels.

## Metrics
- Type Coverage: `tsc --noEmit` clean, no errors.
- Test Coverage: 62/62 relevant tests pass (`sync.test.ts`, `sso.test.ts`, `a11y.test.ts`, `permissions.test.ts`, `api-auth.test.ts`).
- Linting: not run (`next lint`/flat ESLint config not present in this checkout to invoke directly); no lint-suppression comments found in touched files.

## Unresolved Questions
None.

---
Status: DONE_WITH_CONCERNS
Summary: Backend PATCH/DELETE, redaction, RLS, and cascade behavior all verified correct and test-covered; the 4 moved panels are byte-identical to before. One real Medium defect: Pause/Resume, Enable/Disable, and Delete-SSO-connection swallow fetch failures silently (no `res.ok` check), unlike sibling actions in the same files — worth a quick fix but not a blocker for a merge if triaged as follow-up.
Concerns/Blockers: Medium-priority error-handling gap (item 1) should be fixed before or shortly after landing; no security, data-loss, or contract-breaking issues found.
