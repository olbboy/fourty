# Field-level permissions on GraphQL + MCP — completion report

Date: 2026-07-08 · Branch: main · Status: DONE (verified)

## Scope
Close the D1 gap: field-level permissions shipped enforced only on REST; GraphQL
and MCP were bypass doors (a role denied `contacts.email` could still read it via
`/api/graphql` or an MCP tool). Now enforced on all three surfaces via the same
`redact` / `blockedWrites` helper. No schema/migration change (field_permissions
table from 0008 already exists).

## Changes
- **GraphQL** (`src/lib/graphql/schema.ts`): `GqlContext` carries a per-request
  memoized `fieldPolicy(ctx)`. Reads (contacts/companies/deals, list + byId)
  redact unreadable fields → resolve to null. Writes (create/update contact +
  company) call `guardWrites` → `FORBIDDEN` on a blocked field; mutation returns
  are redacted. Snapshot fed to workflows stays un-redacted (internal).
- **MCP** (`src/mcp/tools.ts`): `requireWritableFields` helper. Reads
  (`search`, `list_contacts`, `list_companies`, `list_deals`) redact; writes
  (`create_contact`, `create_company`) refuse a blocked field with `isError`.
- **Tests**: +1 case in `graphql.test.ts` (member key added) and +1 in
  `mcp.test.ts` — each asserts viewer read redaction + admin bypass + member
  write-block + omit-is-ok, on real Postgres/RLS.
- **Docs**: PARITY row + ADR-011 (dropped the "GraphQL/MCP follow-up" caveat,
  now "no surface is a bypass door"); PROGRESS D1 row + test count.

## Verification
- `npx vitest run` → **176/176 pass** (174 → +2).
- `npm run build` → green; `/api/graphql` registered.

## Design notes
- Redact deletes the key: REST/MCP return the field absent; GraphQL's default
  resolver then yields null (field is nullable). Non-null identity fields
  (firstName, name) aren't realistic field-perm targets; a rule on them would
  fail-closed (error), which is safe.
- Policy loaded once per GraphQL request (memoized on ctx); once per MCP tool call
  (each call is standalone) — cheap, few rows/workspace.
- Field rules on custom objects/records remain out of scope (unchanged from D1).

## Unresolved questions
- None blocking. Next candidates unchanged: OAuth transport for mail/calendar
  (C6, reuses D4's OAuth machinery) or SAML.
