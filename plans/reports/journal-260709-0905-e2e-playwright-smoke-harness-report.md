# Playwright E2E Smoke Harness: globalSetup Assumption Was Wrong

**Date**: 2026-07-09 09:05
**Severity**: Medium
**Component**: E2E testing infra (Playwright, `e2e/`, `playwright.config.ts`, CI)
**Status**: Resolved

## What Happened

Built a Playwright + Chromium smoke harness covering 3 critical flows (auth, kanban drag, command palette) against a dedicated `fourty_e2e` Postgres DB, wired into a non-blocking CI job. First real run failed at the very first step: `/login` crashed with `relation "users" does not exist` and Playwright hung retrying the webServer readiness probe until timeout.

## The Brutal Truth

The plan assumed Playwright's `globalSetup` runs before the `webServer` boots — it doesn't. Playwright starts `webServer` and blocks on its readiness check *before* `globalSetup` ever runs, because `globalSetup` is designed to talk to an already-running server (seed via API, warm caches), not to prepare the environment the server needs to boot into. Nobody caught this in planning because it "sounds right" — of course setup runs before the server starts, right? Wrong, and the failure mode was maximally unhelpful: no clear error, just a webServer that never became ready because Next.js couldn't serve `/login` on an empty schema, so Playwright just sat there retrying until its own timeout fired.

## Technical Details

- Error: `relation "users" does not exist` on first `/login` request during `next start` against empty `fourty_e2e` schema.
- Symptom: Playwright's webServer readiness probe never succeeds → hard timeout, not an obvious "DB not migrated" message.
- Fix: deleted planned `e2e/global-setup.ts`. Moved migrate+truncate into the `webServer.command` itself: `npm run build && npm run db:e2e:reset && npm run start`, where `db:e2e:reset` runs `e2e/prepare-db.ts` via `tsx`, reusing `resetDb()` from `tests/pg-setup.ts`.
- Safety guard added to `resetDb()` call path: DB name must contain `"e2e"` or it refuses to truncate — hard stop against ever wiping the vitest `fourty_test` DB by accident.
- Dedicated E2E DB roles: `fourty` (owner, migrates/truncates) vs `fourty_app` (RLS-scoped, what the app connects as) — matches prod-like RLS posture instead of a superuser shortcut.
- Post-review hardening: E2E server pinned to port 3100 (not 3000) so `reuseExistingServer: true` can never accidentally attach to a developer's real dev server/DB.

## What We Tried

1. `globalSetup` migrating DB before webServer — failed, wrong lifecycle assumption, documented above.
2. Native `dataTransfer`-based drag simulation for the kanban test — failed because the kanban `onDrop` reads React state `dragId` set in `onDragStart`, not `dataTransfer` payload. Fixed with a helper dispatching bubbling `dragstart`/`dragover`/`drop` events (`bubbles: true` — React 19 delegates listeners at the root container, not the element) and waiting on the dragged card's `opacity-40` class as the signal React actually committed `dragId` state before firing `drop`. No flakiness after this, no quarantine needed.
3. Escape-to-close command palette test flaked once: Escape was dispatched before the palette's combobox input received focus (focus is set via a 30ms `setTimeout`), so the dialog's `onKeyDown` handler wasn't attached/listening yet. Fixed by waiting for combobox focus before sending Escape.

## Root Cause Analysis

The globalSetup failure is a planning-stage gap: nobody verified Playwright's actual lifecycle ordering against docs before committing it to the plan. It's an easy trap because the name "globalSetup" implies "runs first," and most people's mental model of test harnesses (arrange → act) supports that. Reality: Playwright's docs are explicit that `globalSetup` is for state that depends on a live server. Should've been a 2-minute doc check before writing the phase file.

## Lessons Learned

- Don't infer tool lifecycle order from naming — verify against docs, especially for anything gating CI.
- When a readiness probe hangs instead of failing loudly, suspect a hidden dependency-ordering bug, not a flaky timeout — add a DB name safety guard whenever a script reuses a truncate helper across environments.
- DOM event simulation in tests must match how the app actually reads state (component state vs. native browser API), not what "should" work generically.

## Next Steps

- None blocking — harness is green and merged into CI as non-blocking. If CI flakes on the kanban drag test in the future, check for a `bubbles:false` regression or a change to the `opacity-40` drag-state class first.

---
Status: DONE
Summary: Playwright E2E smoke harness shipped (5/5 passing, ~24s) after fixing a wrong globalSetup-vs-webServer lifecycle assumption, native-DnD state timing, and a focus-race in the Escape-to-close test, with vitest suite (222/222) and tsc left untouched and green.
