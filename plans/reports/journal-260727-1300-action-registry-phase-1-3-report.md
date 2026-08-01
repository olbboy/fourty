# Action Registry Phase 1-3: Three Real Bugs Fixed, One Test Left Unverified

**Date**: 2026-07-27 13:00
**Severity**: High
**Component**: REST/GraphQL/MCP parity, delete cascade, action kernel (`src/lib/actions/`)
**Status**: Resolved (Phases 1-3); Phases 4-5 pending, stopped by user choice

## What Happened

Executed Phases 1-3 of `plans/260727-1033-action-registry-phase-0/plan.md`, implementing ADR-017. Four commits, each independently revertible by plan design (behavior-changing phases are forbidden from being squashed together):

- `1db417a` — GraphQL `deleteContact`/`deleteCompany` never cleaned up related data. REST and MCP did. Deleting a contact through GraphQL orphaned its notes/activities; deleting a company left contacts and deals pointing at a `companyId` that no longer existed. `notes`/`activities` use a polymorphic `(entityType, entityId)` key (`src/db/schema.ts:279`), so there's no FK to hang `ON DELETE CASCADE` off — application-level cascade is the only option, and it now has to be written correctly in exactly the places that call it.
- `b3997f0` — workflow event, `logActivity`, and audit parity. MCP and GraphQL were silently skipping `contact.created`, `contact.updated`, `company.created` dispatch, `logActivity` calls, `audit.meta.fields`, and `changedFields` in event snapshots that REST had. A record created by an AI agent or MCP client skipped every workflow automation with zero error and zero log line.
- `19eb316` — the action kernel (`src/lib/actions/`, 7 files). Declare an operation once; kernel runs RBAC → field-write check → validate → run → activity → audit → rescore → events → redact. Hand-rolled zod→JSON Schema (`json-schema.ts`) instead of adding a dependency, so the schema that validates a call and the schema advertised to MCP agents come from the same source. `execute.ts` is 85 lines — under the plan's self-imposed 120-line abandon threshold. Nothing routes through it yet. Zero runtime behavior change by design.
- `5371258` — ADR-017 index row.

Final state: 377 tests pass, 2 skipped, `tsc --noEmit` clean, `npm run build` exit 0, `package.json` dependencies unchanged, no pre-existing test modified in any phase.

## The Brutal Truth

Two of these three bugs (delete cascade, silent workflow skip) have presumably been live in production since GraphQL and MCP shipped — nobody wrote a test that could see them because the three surfaces were never compared against each other, only each tested in isolation. That's the actual failure mode here: per-surface test coverage looks green while the surfaces silently drift apart. `tests/surface-parity.test.ts` (new, 20 assertions) is the test that should have existed from day one; every one of its 20 failures-before-fix landed on GraphQL or MCP, none on REST, which tells you REST was the de facto reference implementation nobody documented as such.

The kernel work (Phase 3) is the boring, satisfying part — 85 lines, no new dependency, nothing depends on it yet. That's deliberate and it's also the part still unproven: a kernel nothing calls hasn't been tested against real routing pressure.

## Technical Details

- `tests/delete-semantics.test.ts` (new): 13 tests, 3 failed before fix — all 3 on GraphQL delete cascade.
- `tests/surface-parity.test.ts` (new): 20 assertions failed before fix — all on GraphQL or MCP.
- `wc -l src/lib/actions/execute.ts` → 85 (threshold: 120).
- Environment gap: `tests/migration-reversibility.test.ts:18` hardcodes `postgresql://fourty:fourty@localhost:5432/fourty_revtest`. Port 5432 on this machine is occupied by an unrelated project's Postgres; Fourty's own compose Postgres publishes no host port. Worked around with a throwaway container on 5433 for everything else, but this one test never ran against its hardcoded connection string in any of the three phases — it is unverified, not green, and nothing in this session proves otherwise.

## What We Tried

- Ran the full suite against a manually spun-up container on port 5433 instead of fighting for 5432 — works for every test except the one with a hardcoded `localhost:5432` DSN, which nothing in this session touched.
- Re-verified the plan's own bug matrix before writing code (mandated pre-check) instead of trusting the phase file as-is. Found it wrong twice: it told Phase 2 to add `task.completed` dispatch to MCP `create_task`/`update_task`, but MCP has no tool that completes a task at all — `create_task` and `list_tasks` exist, `taskInput` has no `completed` field. It also never listed that company `logActivity`/`audit.meta.fields` diverged on both MCP and GraphQL. Both discrepancies went back to the user instead of being silently implemented-as-written or silently dropped.
- Code review during Phase 3 caught that the kernel applied `blockedWrites` field permissions to every verb, while REST and MCP only apply them to writes. Not fixed here (nothing consumes the kernel yet) but flagged, because once Phase 4 wires `contacts.list` through it, a workspace restricting who may *write* `contacts.status` would start rejecting `?status=lead` — a read — with a 403 REST accepts today.
- `tests/action-kernel.test.ts` initially reused entity id `row-1` across tests in a suite that never truncates between tests — an assertion about "did this call write an activity" could pass for the wrong reason, satisfied by a row three tests earlier. Caught in review, fixed with a per-test id.

## Root Cause Analysis

The delete and parity bugs exist because REST, GraphQL, and MCP each hand-wrote the same guard/side-effect sequence independently — three copies that were never diffed against each other, only tested against themselves. Copy-paste drift is not a hypothetical risk here, it's the actual, already-shipped bug. The kernel is the structural fix; Phases 1-2 were the emergency patches that had to happen regardless of whether the kernel gets adopted further.

## Lessons Learned

- Cross-surface parity needs its own test file that asserts identical side effects for identical operations across every surface — per-surface tests will never catch this class of bug because each surface passes its own tests while diverging from its siblings.
- Re-verify a plan's bug matrix against the actual code before implementing it, even when the plan already went through red-team review. Two errors survived: an MCP capability that doesn't exist, and a divergence class the matrix never tracked.
- Separate structural changes from behavior changes into separate, unsquashed commits. It made every fix here trivially revertible on its own, and it's the only reason the delete-cascade fix and the parity fix can be rolled back independently if either turns out wrong in production.
- Build unused infrastructure before routing anything through it if the infrastructure has to satisfy constraints (blockedWrites-on-read vs blockedWrites-on-write) that only surface once real call sites exist. The blockedWrites bug was found for free, at zero blast radius, because nothing depended on the kernel yet.
- A test-DB port collision with an unrelated project is exactly the kind of environmental noise that gets rounded up to "tests pass" if you're not careful. It didn't here, but only because it was tracked explicitly per phase.

## Next Steps

- Owner: whoever picks up Phase 4 must first get `tests/migration-reversibility.test.ts` running against a real reachable DB (fix the hardcoded port or make it configurable) before trusting Phase 4/5's own "all tests pass" claim — it has been unverified through three phases now, not just this one.
- Phase 4 (route `contacts.*` through the kernel) and Phase 5 (consolidation) remain pending. Plan defines three machine-checkable abandon thresholds for Phase 4: any pre-existing test needs modification, `execute.ts` exceeds 120 lines, or a fifth `effects` hook / middleware chain becomes necessary. Whoever runs Phase 4 owns checking these before proceeding into Phase 5, not after.
- The `blockedWrites`-on-read-vs-write gap found during Phase 3 review needs a decision before Phase 4 wires `contacts.list`, or it ships a permission regression against current REST behavior.
- Unresolved question carried in the plan itself (§7): pre-existing corrupted data from the delete bug (orphan notes/activities, dead `companyId` refs) on any already-deployed instance is not auto-cleaned by this work — only diagnostic queries were considered in scope. Whether to write an optional cleanup script is explicitly deferred, requires operator sign-off since it deletes data.

---
Status: DONE_WITH_CONCERNS
Summary: Phases 1-3 of ADR-017 shipped clean (377 pass, tsc/build green, deps unchanged) fixing a real GraphQL delete-cascade bug and REST/GraphQL/MCP side-effect drift, then landed an unused action kernel at 85 lines; Phases 4-5 intentionally deferred.
Concerns/Blockers: `tests/migration-reversibility.test.ts` has an environment-caused hardcoded-port failure and stayed unverified across all three phases — must be fixed before trusting Phase 4/5 test results.
