# ADR-017 — Action Registry: one definition, every surface

**Status:** Proposed · **Date:** 2026-07-27

> **Relationship to ADR-016.** ADR-016 rejected an "AI SDK / apps platform" and an
> "in-app agent framework as a core feature". **This ADR does not reverse either.**
> The registry here is an **internal** API: not documented for third parties, no
> stability guarantee, no plugin loading, no `create-fourty-app`. Its purpose is to
> *enforce* ADR-016's own guardrail #3 ("AI mutations go through the same
> tool/service helpers, never raw `db` calls"), which the current architecture
> violates. Opening `defineAction()` to third parties would require amending
> ADR-016 and is explicitly out of scope here.

## Context

Fourty exposes the same CRM operations on three surfaces, each hand-wired:

| Surface | Location | Count |
|---|---|---|
| REST | `src/app/api/**/route.ts` | 58 route files |
| GraphQL | `src/lib/graphql/schema.ts` | 1 file, resolvers inline |
| MCP / AI tools | `src/mcp/tools.ts` | 698 lines, ~20 tools |

All three import and manually re-assemble the identical guard/side-effect chain:

```
can()  →  loadFieldPolicy/blockedWrites()  →  zod validator  →  mutate
       →  logActivity()  →  audit()  →  dispatchEvent()  →  recompute*Score()
       →  redact()
```

Three consequences, all observable in the tree today:

1. **Feature loss from duplication cost.** `src/lib/graphql/schema.ts` states in a
   code comment that deals/tasks/notes are *read-only over GraphQL* because
   "their stage/entity-link side effects live in REST". A public API gap caused
   purely by the cost of writing the chain a third time.
2. **Guardrail violation.** `src/mcp/tools.ts` calls `db.select()` / `db.insert()`
   directly rather than going through shared helpers — exactly what ADR-016
   guardrail #3 forbids for the AI path. The guardrail is currently upheld by
   copy-paste discipline, not by construction.
3. **Every new capability costs 3×.** Adding one operation means three
   implementations, three test suites, three drift risks.

Prior art reviewed: **BuilderIO/agent-native** (MIT) centres on `defineAction()` —
one typed definition callable from UI, HTTP, MCP, agent, cron and CLI. The *idea*
is directly applicable. The *code* is not: agent-native is a full framework
(Nitro server + Vite + React + its own router) occupying the same layer as
Next.js. Its docs state it cannot be adopted incrementally into an existing
Next.js app. Adopting it means a rewrite that discards RLS multi-tenancy, RBAC,
field permissions, the audit log, the GraphQL API and the workflow engine.

## Decision

**Port the pattern, not the dependency.** Introduce an internal Action Registry
under `src/lib/actions/`; every surface becomes a thin adapter over it.

```
src/lib/actions/
  define.ts        defineAction({ name, object, verb, input, run, effects })
  execute.ts       the single guard/side-effect kernel
  registry.ts      name → action lookup
  adapters/
    rest.ts        toRouteHandler(action)
    graphql.ts     toResolver(action)
    mcp.ts         toMcpTool(action)      — zod → JSON Schema
    ai.ts          reuses src/lib/ai/tool-bridge.ts
    workflow.ts    action as a workflow step
```

`execute()` runs the chain above exactly once, in one place. `ToolContext` (already
carrying `workspaceId`/`role`/`userId`/`via`) becomes `ActionContext` unchanged, so
RLS scoping, audit attribution and `via:"ai"` tagging keep working as-is.

### Three deliberate limits (anti-over-engineering)

1. **GraphQL types stay hand-written.** Only resolvers are re-pointed at the
   kernel. Auto-generating the SDL from zod risks breaking a published API for
   marginal gain. Deals/tasks/notes mutations get added by hand *once* — the gap
   in consequence 1 closes without a code generator.
2. **`zod → JSON Schema` is hand-rolled (~80 lines), no new dependency.** Every
   input schema in `src/lib/validators.ts` is a flat object of
   string/number/boolean/enum. A general converter is not needed. Preserves the
   ~10-runtime-dependency identity (ADR-016 guardrail #5).
3. **`effects` are plain functions, not a DSL.** `{ activity?, audit?, events?,
   rescore? }` each take `(input, output)` and return a value. No declarative
   mini-language, no lifecycle plugin bus. If a rule needs branching, it is
   TypeScript.

### Migration: strangler, per entity

Both paths coexist per entity; the old one is deleted only after the new one is
green.

| Phase | Scope | Exit criterion |
|---|---|---|
| 0 | Kernel + adapters + `contacts.*` | REST/GraphQL/MCP contact tests pass unchanged |
| 1 | `companies.*`, `deals.*` | GraphQL deal mutations ship (closes the ADR-008 scope gap) |
| 2 | `tasks.*`, `notes.*`, custom records | `src/mcp/tools.ts` holds zero direct `db` calls |
| 3 | New surfaces: cron actions, `run_action` MCP tool | New surface added without touching entity code |

The existing 206+ unit tests and the Playwright e2e suite are the parity net: an
entity is migrated only when its pre-existing tests pass **unmodified**. Rewriting
a test to accommodate the refactor is treated as a failed migration.

## Alternatives rejected

| Option | Why rejected |
|---|---|
| Adopt `@agent-native/core` as a dependency | Impossible. Nitro/Vite framework competes with Next.js at the same layer; upstream docs confirm no incremental adoption. |
| Run agent-native as an opt-in sidecar over Fourty's MCP HTTP endpoint | Two deployables, two databases, an auth/RLS bridge. Destroys the 30-second single-`docker compose` promise (ADR-006) — the actual moat. |
| Migrate Fourty to agent-native wholesale | Discards ADR-001 (RLS), ADR-005 (RBAC), ADR-008 (GraphQL), ADR-011 (field perms) and the workflow engine. Cost is measured in quarters; the gain is a pattern reproducible in ~400 lines. |
| Do nothing; keep three hand-wired surfaces | The 3× cost compounds, and guardrail #3 stays unenforceable by construction. |

## Consequences

**Gained**
- One implementation per operation. `src/mcp/tools.ts` shrinks to declarations.
- ADR-016 guardrail #3 becomes structural rather than aspirational — the AI path
  *cannot* bypass RBAC/field-perms/audit, because there is no second path.
- New surfaces are near-free: a CLI, recurring agent jobs on the existing pg-boss
  queue, or an app-to-app endpoint each cost one adapter, not N handlers.
- A verifiable positioning claim: *every Fourty capability is callable from UI,
  REST, GraphQL, MCP, the agent and workflows, from a single definition* — testable
  by asserting registry coverage, and consistent with `CLAIMS.md` discipline.

**Costs / risks**
- Cross-cutting refactor of 58 route files. Mitigated by strangler phasing and the
  unmodified-tests rule.
- **The unmodified-tests rule did not survive the first entity.** Migrating
  contacts required editing four test files. Two were the kernel's own and had
  become self-referential, which is unremarkable. The other was not: two static
  security guards in `tests/api-auth.test.ts` recognised routes by their source
  text, so a route rebuilt on the shared handler stopped matching. One failed
  loudly; the other silently stopped classifying the routes as mutating at all,
  because its pattern only matched a handler exported as a function declaration.
  Expect the same for every guard that reasons about the shape of a route file
  rather than its behaviour, and budget for finding them — the silent failure is
  the one that matters, and only reading the guard revealed it.
- **Strangler migration is not available on the MCP surface.** Tools live in a
  name-keyed array, so an old and a new implementation of the same tool cannot
  coexist. Rollback is reverting the commit, not switching an import back.
- A kernel is a chokepoint: a bug there hits every surface at once. Mitigated by
  the kernel being small, pure-ish and directly unit-tested.
- Abstraction creep is the real failure mode. The three limits above are binding;
  a fourth adapter kind or a declarative effects DSL requires a new ADR.
- The registry is **not** a public extension point. Documenting it as one, or
  loading actions from outside the repo, reopens ADR-016 and needs its own ADR.
- **Nothing ties an action's declared `object` to the tables it actually
  touches.** The permission check reads `object` from the declaration, so an
  action that says `contacts` while writing to `deals` would be checked against
  the wrong thing and no test would notice. The claim above — that the AI path
  cannot bypass RBAC because there is no second path — holds only while every
  declaration stays honest, and that is a convention, not a mechanism. With one
  entity migrated it is not worth building enforcement; the cheap version, when
  it becomes worth it, is a test that runs each action against a `db` proxy and
  records which tables it reached.
- **Dispatching an event is not atomic with the write that caused it.** The
  kernel hands workflow events to the queue, which commits outside the request's
  `withWorkspace()` transaction. If a later step throws and the transaction rolls
  back, the workflow job still runs against a record that no longer exists. This
  is pre-existing behaviour, inherited unchanged — the kernel neither worsens nor
  fixes it. Closing it means an outbox pattern, which is its own decision.
- **The kernel normalises an ordering the REST handlers disagree on.** Today
  `create` audits before recomputing a score and `update` does the reverse. The
  kernel always runs activity → audit → rescore → events. The two steps are
  independent — audit never reads a score — so the choice is arbitrary, but it is
  now fixed and pinned by a test rather than varying per handler.
- **Workflow events cannot currently loop, but nothing enforces that.** Making
  every surface dispatch the same events widens the blast radius of a dispatch
  cycle. There is no cycle today: every workflow action in
  `src/lib/workflows/engine.ts` writes to the database directly, and no queue
  handler in `src/worker/handlers.ts` re-enters `dispatchEvent` — so a workflow
  can never trigger the event that started it. That safety is a property of the
  current fixed action set, not an invariant the code checks. Any future action
  or handler that creates or updates a record through an action, a route, or a
  tool re-opens the question and needs an explicit depth or re-entrancy guard.

**Explicitly out of scope**
Public/plugin SDK, `create-fourty-app`, third-party action loading, autonomous
agents that write without confirmation (ADR-015's stop-at-write loop stands),
migrating off Next.js, and any new runtime process.
