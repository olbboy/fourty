# Tier-2 parity + B6 — plan

_Branch `main`. Started 2026-07-08. Continues after B1–B5 (94/94 tests green)._

## Anti-vanity rule (inherited)
Nothing is "done" without a passing test or a command actually run. No fakes/mocks
to satisfy a check. Every migration reversible (up→down→up, checksum-identical).

## Gates

| Gate | Feature | State | Evidence target |
|---|---|---|---|
| C1 | Custom objects (no-code) + record validation | ⬜ | `tests/custom-objects.test.ts`, migration 0006 reversible |
| C2 | Auto GraphQL for every object (fixed + custom) | ⬜ | `tests/graphql.test.ts` (query/mutation/introspection/RLS) |
| C3 | Saved-views API + list UI | ⬜ | `tests/saved-views.test.ts` + UI wired |
| C4 | i18n (catalog + t() + locale resolution) | ⬜ | `tests/i18n.test.ts` (catalog completeness + interp) |
| C5 | a11y pass (shell, palette, forms, ui) | ⬜ | source fixes + build green + checklist in docs |
| C6 | Email/calendar ingestion engine | ⬜ | `tests/sync.test.ts` (.eml + .ics fixtures → link+store) |
| B6a | `@fourty/twenty-migrate` CLI | ⬜ | transform unit tests w/ fixtures |
| B6b | MCP server (stdio JSON-RPC) | ⬜ | `tests/mcp.test.ts` (initialize/tools.list/tools.call) |
| B6c | Docs: PARITY/PROGRESS/README/ADR/llms.txt | ⬜ | updated + cited |

## Architecture invariants to preserve
- DB choke point: all data flows through `withWorkspace()` tx (RLS). New tables get
  `workspace_id DEFAULT current_setting('app.workspace_id')` + ENABLE/FORCE RLS + tenant policy.
- RBAC: every mutating route calls `authorize(auth, object, action)` (static guard in
  `tests/api-auth.test.ts`). Extend `permissions.ts` for new objects.
- Migrations: add `drizzle/000N_*.sql` + `drizzle/down/000N_*.down.sql`; bump counts in
  `tests/migration-reversibility.test.ts`.
- Value semantics: millis→bigint(number), flags→int, JSON→text.

## Design decisions (locked)
- **Custom objects** metadata-driven, KISS: one `custom_records` table with JSON `data`
  (no per-object DDL — safe under RLS, one reversible migration). `custom_objects` +
  `custom_object_fields` define schema. Records validated against field defs on write.
- **GraphQL** on the reference `graphql` package (near-zero deps); schema built from an
  object registry per request; resolvers reuse the RLS `db` path. Mount `/api/graphql`.
- **Email/calendar**: real RFC822 + ICS parsers, participant→contact matching, injectable
  fetcher so tests use fixtures (OAuth provider wiring documented, not fabricated).
- **MCP**: hand-rolled stdio JSON-RPC (no heavy SDK) exposing search/list/create/report.

## Reports
`plans/reports/`
