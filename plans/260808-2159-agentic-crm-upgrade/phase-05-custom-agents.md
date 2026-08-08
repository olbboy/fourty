# Phase 5 — Custom agents with typed permission manifests

**Size:** L · **Depends on:** Phases 1, 2, 4 · **Optional / strategic**

> **Entry gate:** ADR-016 currently states "In-app autonomous AI agents (as a core feature): **NO**" (§capability matrix) with binding guardrails. This phase may not start until that ADR is formally amended (superseded-by note + what changed and why). Do not amend it as a side effect of a code PR.

## Why

Comp AI's most ambitious feature is "describe an agent in one sentence and deploy it". The valuable half is not the builder chat — it is the **permission model underneath**, and Fourty is unusually well placed to build that half: it already has an action registry defining each operation once for REST/GraphQL/MCP/AI (ADR-017), object RBAC, field permissions and an immutable audit log. Comp AI had to invent all of that; Fourty has to *compose* it.

Ship the permission model first. The natural-language builder is a UI on top and can wait.

## Requirements (each one is a rule, not a preference)

- **Empty never means all.** A version chooses record scope `SELECTED` or `WORKSPACE` explicitly. Selected scope requires at least one tagged record; workspace scope is an explicit grant and cannot also list records.
- **Actions are structured permissions.** A grant names the operation *and* its variant — `crm.activity.create` separately naming `NOTE`, `TASK`, or both. Runtime enforcement never infers a grant from an action's prose summary.
- **Every action is ledgered before execution**, keyed by the model's call id, so a replay is a no-op rather than a second write.
- **Deployment is the human approval boundary.** Saving produces a private `READY` version and never deploys it. A person reviews trigger, scope, actions, access and the exact instructions, then pins that immutable version.
- **Fail closed.** A manifest missing an explicit scope mode or an action grant does not run. Versions created before a permission type existed must be revised and redeployed.
- **No generic execution surface.** No shell, no arbitrary web, no direct DB. A custom agent reaches the CRM only through registry actions it has been granted.
- The agent runs under the **least** of: the manifest grants, the owner's RBAC, and field permissions. A manifest can only narrow, never widen.

## Files

**Create**
- `drizzle/00XX_agents.sql` (+ down) — `agents`, `agent_versions`, `agent_runs`, `agent_actions`.
- `src/lib/agents/manifest.ts` — the zod manifest schema + `validateManifest()`.
- `src/lib/agents/authorize.ts` — grant × RBAC × field-permission intersection. Pure, exhaustively tested.
- `src/lib/agents/run.ts` — the runner: resolve pinned version → ledger each action → execute via the registry.
- `src/app/(app)/settings/sections/agents.tsx` + a review/deploy screen.
- `tests/agents-manifest.test.ts`, `tests/agents-authorize.test.ts`, `tests/agents-run-idempotency.test.ts`.

**Modify**
- `src/lib/actions/registry.ts` — each action declares the permission id it requires and whether it mutates (partly present already).
- `src/lib/audit.ts` — an agent-originated write audits the agent version id alongside `via:"ai"`.
- `src/lib/agent-tasks/kinds.ts` — `agent.run` as a `session`-lane kind.

## Manifest shape (v1)

```jsonc
{
  "version": 1,
  "trigger": { "type": "schedule" | "manual" | "event", "…": "…" },
  "scope":   { "mode": "SELECTED" | "WORKSPACE", "records": ["contact:abc"] },
  "actions": [ { "id": "crm.activity.create", "variants": ["NOTE"] } ],
  "reads":   [ "contacts", "companies", "deals" ],
  "budget":  { "steps": 12 }
}
```

## Steps

1. `manifest.ts` + `authorize.ts` first, pure and exhaustive. This is the whole phase; everything else is plumbing. Test the fail-closed cases explicitly: no scope mode, empty variants, an action absent from the registry, a grant the owner's RBAC does not hold.
2. Tables + RLS. `agent_actions.idempotency_key` unique; status `PLANNED → RUNNING → DONE | FAILED`, written *before* the call.
3. Runner on the Phase 2 `session` lane, budget-bounded, using Phase 1's write path for any field write.
4. Review + deploy screen: shows the diff of what this version may do. Deploy pins an immutable version; editing creates a new one.
5. Only then, the natural-language builder — and it produces a **draft**, never a deployment.

## Validation

- Fail-closed matrix as a table test.
- Replay: the same call id executed twice performs one write.
- Narrowing: an agent owned by a user without `deals:write` cannot write deals even with the grant in its manifest.
- Audit: every agent write is attributable to a version id.

## Risks

- **Scope** — this is the largest phase and the most deferrable. If the roadmap needs cutting, ship 1–4 and stop; they stand alone.
- **A builder that writes its own permissions** — the deploy boundary is what makes that safe. Do not add an "auto-deploy" convenience.
- **Two permission systems** — the manifest must intersect with RBAC, never replace it. `authorize.ts` is the single place that composes them.
