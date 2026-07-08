# ADR-008 — Auto GraphQL API

**Status:** Accepted · **Date:** 2026-07-08

## Context
Twenty is GraphQL-first with an auto-generated typed API for every object. Fourty
had hand-written REST only. To offer parity we add a GraphQL endpoint without
taking on a heavy server framework or diverging from REST behavior.

## Decision
**One `/api/graphql` POST on the reference `graphql` package (zero runtime deps).**

- Schema is built **programmatically** and **cached once** — it is workspace-
  independent; RLS scopes the *data* at query time, not the *shape*.
- **Typed queries for every core object** (contacts, companies, deals, tasks,
  notes) plus `customObjects` / `records(object)` for no-code objects — this is
  the "GraphQL for every object" headline.
- **Mutations where writes are side-effect-simple**: contacts + companies (with
  the same scoring/audit as REST) and custom records. Deals/tasks/notes are
  **read** via GraphQL but **written via REST**, where their stage-transition and
  polymorphic-link side effects live. This is a stated scope, not a stub.
- Resolvers run inside the request's `withWorkspace()` transaction (RLS holds) and
  enforce **RBAC per-resolver via `can()`** — the same predicate the REST
  `authorize()` wraps. The route is therefore exempt from the route-level
  `authorize()` static guard, documented in `tests/api-auth.test.ts`.
- Inputs use a JSON scalar validated by the existing zod validators, so the REST
  and GraphQL contracts can't drift.

### Why not graphql-yoga / Apollo?
They pull large dependency trees for features (subscriptions, file uploads, plugin
systems) Fourty doesn't need. The reference `graphql` package + ~20 lines of
transport keeps the footprint tiny and legible.

## Consequences
- GraphQL errors travel in the response body; HTTP stays 200 unless the request
  is malformed.
- Introspection works out of the box (tooling, codegen).
- Extending an object means adding fields to its `GraphQLObjectType`; custom
  objects need no schema change (served through the generic `records` field).
