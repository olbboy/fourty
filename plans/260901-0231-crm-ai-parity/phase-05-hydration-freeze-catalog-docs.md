---
phase: 5
title: "Hydration, freeze, catalog, docs"
status: pending
priority: P1
effort: "2h"
dependencies: [4]
---

# Phase 5: Hydration, freeze, catalog, docs

## Overview

Verify `/login` hydration (fix only a proven cause). Rewrite the GraphQL freeze fixture from live `printSchema`. Make every advertised MCP count equal `TOOLS.length`. Align product docs + CHANGELOG with what actually shipped. `tsc` + focused vitest green.

## Context Links

- Live check 2026-09-01: `/login` compiled, badge `data-error=false`, no hydration console error. Do **not** patch speculatively.
- Freeze: `tests/action-contacts.test.ts` compares `printSchema(fourtySchema())` to `tests/fixtures/graphql-schema.graphql`
- Catalog: `tests/mcp-catalog.test.ts` vs README, `docs/api/mcp.md`, `docs/getting-started/*`, `public/llms.txt`
- Docs to match behavior: `docs/api/graphql.md`, `docs/api/mcp.md`, `docs/guides/ai-assistant.md`, `docs/guides/custom-objects.md`, `CHANGELOG.md`

## Key Insights

- Dev server may already be on `:3000` with `DATABASE_URL …:5439/fourty`. Reuse it; do not spawn a second Next.
- Fixture must be the exact `printSchema` string. After phases 2–4 the freeze test is the canary for forgotten fields.
- Catalog test checks **names** and **N tools**. CHANGELOG historically said “Catalogue is 36 tools” — update that line if it still claims 36.
- Docs language: English. Do not invent admin GraphQL.

## Requirements

- Functional: login page has no hydration error after compile, or the failure is diagnosed and fixed at the proven source. Docs describe Agent on custom objects, `reportStats` / `get_report_stats`, custom-object search, pipeline reads, and the new tool count.
- Non-functional: no commit unless the user asks; no login “fix” without a failing case.

## Architecture

Verification only plus doc/fixture alignment. No new runtime module.

Login procedure:

1. `lsof -i :3000` — reuse existing `next dev` if it is this repo.
2. Open `/login`. Wait until the Next error badge is present.
3. Confirm `data-error=false` (or equivalent) and console has no `Hydration` / `did not match` / `Minified React error`.
4. Submit demo login only if needed to confirm the form still works (`demo@fourty.dev` / `demo1234`).
5. If it **does** reproduce: identify the exact component (likely login-form vs overlay). Fix that cause. Re-verify. Do not “stabilize” by suppressing the overlay.
6. If it does **not**: write a one-line note under Success Criteria in this file (or `plans/reports/`) that it was closed-as-non-issue on DATE. No product code change.

## Related Code Files

- Modify (always): `tests/fixtures/graphql-schema.graphql`
- Modify (always): docs listed above + `CHANGELOG.md` Unreleased
- Modify (if count still wrong): README, `public/llms.txt`, getting-started pages
- Modify (only if login reproduces): `src/app/login/*` and related
- Modify: none of the GraphQL/MCP implementation in this phase unless freeze/catalog prove a miss from 2–4

## Implementation Steps

1. `npx tsc --noEmit`.
2. Focused vitest on `:5439`:
   `npx vitest run tests/graphql.test.ts tests/mcp.test.ts tests/mcp-catalog.test.ts tests/mcp-neighbours.test.ts tests/record-context.test.ts tests/field-permissions.test.ts tests/action-contacts.test.ts tests/pipelines.test.ts tests/command-palette-search.test.ts`
   Add any new test files from earlier phases.
3. Replace freeze fixture with `printSchema` output if the test still fails.
4. Grep `36 tools` and `## Tools (` — leftover must match `TOOLS.length` (expected 39).
5. Docs pass: graphql.md (`reportStats`, `search.records`, `pipelines`); mcp.md (new tools + search text); ai-assistant.md (Agent tab on custom objects); custom-objects.md (Agent + search); CHANGELOG Unreleased bullets.
6. Login verify-or-close as above. Custom-object Agent tab + ⌘K smoke on `:3000` if AI key / demo data allow.
7. Do not `git commit`.

## Todo

- [x] `tsc --noEmit` clean
- [x] Focused vitest green on `:5439`
- [x] Freeze fixture = printSchema
- [x] MCP catalog names + count honest (expected 39)
- [x] Docs + CHANGELOG match shipped behavior
- [x] `/login` verified or closed-as-non-issue with evidence (2026-09-01: GET `/login` HTTP 200 on :3000; prior live check badge `data-error=false`. This plan did not touch `src/app/login`. Closed-as-non-issue — no speculative patch.)
- [x] Agent tab + ⌘K smoke on a custom record (browser)

## Success Criteria

- [x] All acceptance criteria in `plan.md` checked
- [x] No remaining `36 tools` in product docs
- [x] Freeze test green
- [x] Login: passing live check **or** a real fix with re-verify
- [x] Working tree still uncommitted unless the user asked

## Risk Assessment

- **Stale freeze from a hand-edit.** Signal: one-field order mismatch. Response: overwrite fixture from printSchema, never fight hunks.
- **Docs claim writes for pipelines.** Signal: graphql.md lists `createPipeline`. Response: delete that sentence; writes are REST-only.
- **Login flake vs real hydration.** Signal: badge true only during compile. Response: wait for compile, then judge. Overlay during compile is not a bug.

## Security Considerations

- Do not paste `.env` secrets into reports.
- Demo credentials in this phase file are the public seed pair already in docs — not a leak.

## Next Steps

`/ak:cook` this plan after validate (recommended). Do not start a sixth phase for admin GraphQL.
