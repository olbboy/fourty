# Lịch sử pull request và release trên GitHub (lưu trữ)

Ngày 22/10/2026 repo `olbboy/fourty` được xoá và tạo lại cùng tên, để GitHub không còn giữ commit cũ có dữ liệu của khách hàng thử nghiệm. 51 pull request và lịch sử chạy CI mất theo repo cũ, nên tiêu đề và mô tả của chúng được lưu ở đây. Số PR là số trên repo cũ; mã commit nhắc trong mô tả là mã trước khi lịch sử được viết lại.

## Danh sách

| # | Tiêu đề | Trạng thái | Merge | Nhánh |
|---|---|---|---|---|
| 1 | feat(ai): AI-native strategy (ADR-015) + Tier 1/2/3 implementation | merged | 2026-07-09 | `claude/app-twenty-comparison-fgpl5z` → `main` |
| 2 | feat(ui): adopt shadcn/ui on Base UI and rebuild the app shell | merged | 2026-08-09 | `claude/intelligent-stonebraker-def72a` → `main` |
| 3 | docs: re-verify Fourty against trycompai/crm and fix three stale claims | merged | 2026-08-09 | `claude/feature-repo-inventory-compare-2c8bdd` → `main` |
| 4 | test(sync): fix the flaky token-leak assertions | merged | 2026-08-09 | `fix/sync-test-token-fixtures` → `main` |
| 5 | feat(brand): add the Fourty logo and brand guidelines | merged | 2026-08-09 | `claude/design-modern-opensource-logo-117379` → `main` |
| 6 | Adopt the brand palette and the real logo artwork | merged | 2026-08-10 | `design/brand-palette-adoption` → `main` |
| 7 | Ship the designer's lockup, then put every control on one implementation | merged | 2026-08-10 | `design/logo-artwork-v2` → `main` |
| 8 | Remove the lint script that never ran | merged | 2026-08-10 | `chore/remove-dead-lint-script` → `main` |
| 9 | Deliver invites by email and add a page to redeem them | merged | 2026-08-28 | `claude/droplet-dokploy-deploy-d904b5` → `main` |
| 10 | Add an HTTPS mail transport for hosts that block outbound SMTP | merged | 2026-08-28 | `claude/droplet-dokploy-deploy-d904b5` → `main` |
| 11 | Add a password reset script for locked-out instances | merged | 2026-08-28 | `claude/reset-password-script` → `main` |
| 12 | Forgot-password over email | merged | 2026-08-28 | `claude/forgot-password` → `main` |
| 13 | Carry an invite through sign-in with a guarded ?next= | merged | 2026-08-28 | `claude/login-next-redirect` → `main` |
| 14 | Repair the drizzle snapshot chain so db:generate works again | merged | 2026-08-28 | `claude/repair-drizzle-meta` → `main` |
| 15 | Build emailed links and OAuth redirects from the forwarded host | merged | 2026-08-28 | `claude/fix-origin-behind-proxy` → `main` |
| 16 | Tell the admin the invite mail may be in spam | merged | 2026-08-28 | `claude/invite-panel-spam-hint` → `main` |
| 17 | feat(ui): screens for two-factor auth and custom objects | merged | 2026-08-29 | `claude/codebase-review-audit-9b75d4` → `main` |
| 18 | fix(custom-objects): revalidate records when a field definition changes | merged | 2026-08-29 | `fix/custom-object-field-retype-revalidation` → `main` |
| 19 | docs: add ops runbook, feature audit and platform research | merged | 2026-10-12 | `docs/ops-reports-and-runbook` → `main` |
| 20 | ci: run on push only for main | merged | 2026-10-12 | `ci/push-trigger-main-only` → `main` |
| 21 | docs(crm): add domain glossary and PilotCo pipeline fit report | merged | 2026-10-12 | `claude/pilot-sales-pipeline-bd7929` → `main` |
| 22 | feat(deals): assign and hand over deal owners, refuse unconvertible currencies | merged | 2026-10-13 | `feat/deal-owner-currency` → `main` |
| 23 | feat(reports): reporting currency per workspace and quarterly forecast tables | merged | 2026-10-13 | `feat/reporting-currency-forecast` → `main` |
| 24 | docs(plans): record the live droplet deployment in the runbook | merged | 2026-10-13 | `docs/runbook-droplet-live` → `main` |
| 25 | fix(auth): keep SSO with the instance owner and sign in to an active workspace | merged | 2026-10-13 | `fix/workspace-members-scoping` → `main` |
| 26 | fix(invites): say an invite was used instead of calling it expired | merged | 2026-10-13 | `fix/invite-already-accepted` → `main` |
| 27 | feat(invites): show the sign-in email on the accept page | merged | 2026-10-13 | `feat/accept-shows-login-email` → `main` |
| 28 | docs: user administration and CRM feature-gap research | merged | 2026-10-13 | `docs/user-admin-and-feature-gaps` → `main` |
| 29 | fix(invites): a member cannot spend someone else's invite; rejoining lands in the workspace | merged | 2026-10-13 | `fix/invite-accept-existing-member` → `main` |
| 30 | feat(invites): admins see pending invites, resend and revoke them | merged | 2026-10-13 | `feat/invites-pending-list` → `main` |
| 31 | feat(owners): show owners, filter by them, and hand work over in bulk | merged | 2026-10-13 | `feat/owner-visibility-handover` → `main` |
| 32 | feat(deals): show old and new values on the timeline; ask for the lost reason | merged | 2026-10-13 | `feat/value-history-lost-reason` → `main` |
| 33 | feat(reports): split the quarterly forecast by owner | merged | 2026-10-13 | `feat/forecast-by-owner` → `main` |
| 34 | feat(notes): the author or an admin can correct or delete a note | merged | 2026-10-13 | `feat/edit-notes` → `main` |
| 35 | feat(accounts): rename yourself, change your password, and rescue a member's account | merged | 2026-10-13 | `feat/account-rescue` → `main` |
| 36 | feat(reminders): a morning email of each owner's due and overdue tasks | merged | 2026-10-13 | `feat/morning-reminders` → `main` |
| 37 | feat: batch 2 — sessions, access by person, trash, deal contacts, product lines, send email | merged | 2026-10-14 | `feat/crm-batch-2` → `main` |
| 38 | docs(plan): batch 2 done; decisions Q90–Q93 | merged | 2026-10-14 | `docs/batch-2-decisions` → `main` |
| 39 | feat: batch 3 wave 1 — owners, bulk changes, phone and note search, touchpoints, tags, task calendar | merged | 2026-10-14 | `feat/crm-batch-3` → `main` |
| 40 | feat(crm): batch 3 waves 2 and 3 — merge, deal import, templates, quotes, targets, audit filters, member reactivation, workflow events, synced email on deals | merged | 2026-10-14 | `feat/crm-batch-3-wave2` → `main` |
| 41 | docs(plan): batch 3 done and deployed | merged | 2026-10-14 | `docs/batch-3-done` → `main` |
| 42 | fix(queue): a job waits for the write that asked for it to commit | merged | 2026-10-14 | `fix/events-after-commit` → `main` |
| 43 | docs(plan): record Q99-Q101 | merged | 2026-10-14 | `docs/batch-3-q99-q101` → `main` |
| 44 | fix(import): a deals file dropped on the contacts import is caught | merged | 2026-10-14 | `fix/import-mode-guess` → `main` |
| 45 | feat(contacts): leads from another system create a contact or fill the known one | merged | 2026-10-15 | `feat/lead-intake` → `main` |
| 46 | feat(leads): a default lead owner for contacts an API key makes | merged | 2026-10-15 | `feat/default-lead-owner` → `main` |
| 47 | docs(plan): lead intake test, reminder check, Q109 | merged | 2026-10-15 | `docs/lead-intake-test` → `main` |
| 48 | fix(trash): a deleted record takes its open tasks with it | merged | 2026-10-15 | `fix/trash-takes-open-tasks` → `main` |
| 49 | docs(reports): PilotCo API curl guide | merged | 2026-10-15 | `docs/pilot-api-curl` → `main` |
| 50 | feat(leads): the default lead owner also receives companies, deals and tasks a key makes | merged | 2026-10-15 | `feat/default-owner-all-records` → `main` |
| 51 | chore: keep the pilot customer's data out of the product repo | merged | 2026-10-22 | `chore/remove-client-data` → `main` |

## Release

### v1.0.0: Fourty v1.0.0

First stable release. **Fourty** is a complete, self-hostable CRM that runs as a single Node process on top of SQLite — no Postgres, Redis, or queue servers. Deploys in ~30 seconds.

##### Added

- **Core CRM** — Contacts, Companies, Deals, Tasks, and Notes, each with a polymorphic activity timeline. List views with search, filter, and sort; full record detail pages.
- **Kanban pipeline** — drag deals between stages with optimistic updates; per-column totals and probability-weighted forecasts. List view included.
- **Automatic lead scoring** — every contact gets a live 0–100 score from profile fit, engagement recency, and commercial signals. Pure, tested model.
- **Analytics dashboard** — open pipeline, weighted forecast, 90-day win rate, average sales cycle, revenue trend, funnel by stage, hottest leads, tasks due, and stale-deal alerts.
- **Reports** — win/loss by month, lead-source conversion, pipeline aging, lead-temperature and lifecycle distributions.
- **Workflow automation** — visual builder with triggers, conditions, template variables (`{{firstName}}`), five action types (create task, add note, update field, webhook, log), and full run history. Runs in-process.
- **Multi-currency** — deals in 12 currencies; all reporting normalizes to USD.
- **Custom fields** — add text/number/date/select/checkbox/URL fields to any object; instantly available in forms, detail pages, and the API.
- **CSV import/export** — fuzzy header matching, email de-duplication, and automatic company linking/creation on import.
- **⌘K command palette** — global search across contacts, companies, and deals plus quick navigation.
- **REST API + API keys** — every resource over JSON, authenticated with SHA-256-hashed Bearer tokens; outbound webhooks via workflow actions.
- **Dark mode & PWA** — OS-aware theme with manual toggle; installable mobile experience with a native-style bottom nav.
- **Self-initializing** — schema and a default 7-stage pipeline are created on first boot; optional demo data from the setup screen.

##### Engineering

- Next.js 15 (App Router) + React 19, Tailwind CSS v4, Drizzle ORM over better-sqlite3 (WAL mode).
- 33 unit/integration tests (scoring, CSV, currency, workflow engine).
- MIT licensed. Dockerfile and GitHub Actions CI included.

##### Quickstart

```bash
git clone https://github.com/olbboy/fourty.git
cd fourty
npm install
npm run build && npm start
```

Or with Docker:

```bash
docker build -t fourty . && docker run -p 3000:3000 -v fourty-data:/app/data fourty
```

### v2.0.0: Fourty 2.0.0

Fourty keeps the CRM true on its own. Connect a mailbox and it fills in what it
can from the signatures and replies already there — no API key, no data vendor,
no model — showing the evidence for every value it writes and never overwriting
one a person typed.

**Upgrading from 1.x:** three things need your attention. Set
`FOURTY_SECRET_KEY` before connecting any new mailbox, switch any use of
`config.url` to `config.urlHost`, and make sure you are on Node 20.9 or newer.
Each is described under *Changed*. Existing mailboxes keep working; run
`npm run rekey` to encrypt what they already stored.

##### Added

- **Fourty now fills in contact fields from your own mailbox, with no API key.**
  Connect a mailbox and a background pass reads the signatures and replies
  already in it: an empty job title or company link is filled in, with the
  evidence shown under the field. There is no data vendor, no AI model and no
  network call involved — it is a parser, so it works on a fresh install with
  nothing configured. A value a person typed is never overwritten; a job change
  against it arrives as a suggestion instead. Every automatic write has one-click
  Revert, and the whole thing has a per-workspace off switch in
  Settings → Diagnostics. Historical mail is not re-read: research starts from
  the next sync. See `docs/guides/research.md`.
- **Suggestions you can audit.** Every finding is priced by a pure function
  rather than by a model grading its own confidence. A lone email signature is a
  suggestion, not a write; two sources that disagree hold the field entirely and
  nothing is written. Accept, Dismiss and Revert sit under the field the
  suggestion is about, and a dismissed value is never offered again.
- **A background work ledger.** What the agent will do to a record, when, and
  why is now a row in a table rather than an opaque job payload — shown on the
  record page in plain words. Connected mailboxes are pulled on a schedule from
  this ledger, so a mailbox stays in sync without anyone pressing *Sync now*.
- **An Agent tab on contacts, companies and deals.** A conversation about *that*
  record, with durable per-user threads: two reps asking about one contact are
  having two conversations, and a transcript survives a reload, a tab switch and
  an unreachable provider. With no AI provider configured the tab still opens,
  says so plainly, and shows what the keyless research pass found.
- **Mailbox credentials are encrypted at rest.** An OAuth refresh token — and a
  private ICS feed URL, which carries its own secret in the path — are stored
  with AES-256-GCM under a new `FOURTY_SECRET_KEY`, which lives in the
  environment and never in the database. A database dump, a backup or a read
  replica no longer hands over the mailboxes. It is not protection from an
  attacker who already has the running process. `npm run rekey` rotates the key
  with no window in which anything is unreadable, and is also how an install
  that has just set a key encrypts rows that predate it. See `SECURITY.md` and
  ADR-019.
- **Single sign-on and mailboxes can be set up from Settings.** Both features
  already worked, but only over the API — adding an OIDC provider meant a curl
  request with a client secret on the command line. Settings now lists and
  manages OIDC providers (admins only) and mailbox/calendar connections,
  including running the OAuth connect, pulling on demand, pausing, and
  disconnecting. The SSO client secret stays write-only: it is never returned,
  and leaving the field blank when editing keeps the existing one.
- **A mailbox can be renamed, paused, and disconnected** —
  `PATCH` and `DELETE /api/sync/accounts/{id}`, which did not exist before.
  Disconnecting also drops the ingested mail and calendar rows recorded against
  that account; email and meeting entries already filed on a contact's timeline
  are keyed to the contact and stay. Only a failed pull can put an account into
  the error state, so the update endpoint accepts `active` and `paused` only.

##### Changed

- **Breaking — connecting a mailbox now requires `FOURTY_SECRET_KEY`.** With no
  key set, adding a mailbox or calendar of any kind is refused with a message
  naming the fix, rather than writing a credential to the database in the clear.
  Mailboxes connected before this upgrade keep working untouched, and are
  encrypted the next time their token refreshes — or immediately, if you run
  `npm run rekey`. An ICS feed used to be the one mailbox type that needed no
  key; its URL is a credential, so it now does. Generate one with
  `openssl rand -base64 32`, and back it up somewhere other than beside your
  database dumps.
- **Breaking — `GET /api/sync/accounts` no longer returns the ICS feed URL.**
  `config.url` is replaced by `config.urlHost` (for example
  `calendar.google.com`). The full URL grants read access to the calendar, so it
  no longer leaves the server, not even for an admin. If you displayed
  `config.url`, switch to `config.urlHost`.
- **Breaking — Node.js 20.9 or newer is required.** Fourty is on Next.js 16,
  which declares that engine; Node 20.0–20.8 no longer work. The Docker image and
  CI already use Node 22. This upgrade also closed eight dependency advisories
  that had been failing the security gate.
- **Mail sync no longer holds a database transaction open across the network.**
  Pulling a mailbox used to keep a Postgres connection idle for the whole
  round-trip to Google. Both *Sync now* and the scheduled pull now open short
  transactions around the fetch instead. Nothing changes about what you see; it
  matters when several mailboxes sync at once.
- **Workflows now run for records created or updated through the AI assistant,
  MCP clients, and the GraphQL API.** Until now only the REST API reliably fired
  workflow events, so a contact created by an agent silently skipped every
  workflow — no error, no log. If you have workflows on contacts or companies,
  expect them to start firing for these sources. Deal workflows are unaffected;
  they already fired everywhere. Nothing fires on delete, on any surface — that
  is unchanged.
- **Two error messages about contacts changed wording.** Refusing a write to a
  field your role may not edit now reads `Forbidden: cannot write contacts
  field(s): status` on the REST API, matching what the GraphQL and MCP APIs
  already said; it used to read `Not permitted to set field(s): status`. The
  HTTP status is still 403. Invalid input reported by an MCP tool now names the
  field first — `firstName: Required` instead of `Required` — again matching the
  other two APIs. If you match on these strings, update your patterns.
- **Asking a contact list for `limit=0` now returns the default page** over the
  GraphQL and MCP APIs, instead of an empty list; the REST list has always
  behaved this way, and the three now agree.
- **Listing contacts over MCP now matches job title as well as name and email.**
  The `list_contacts` tool searched only names and email addresses, so an agent
  looking for "Rear Admiral" found nobody while the same search over REST found
  them. All three APIs now search the same three fields. The page size and its
  200-row ceiling are unchanged.

##### Fixed

- **Searching contacts over GraphQL now looks at the same fields as the REST
  API.** `contacts(q:)` only matched a contact's first name, so a search by
  surname, email address, or job title returned nothing — the REST list has
  always matched all of those. Surrounding whitespace in the search term is now
  ignored too, again matching REST.
- **Activity timeline and audit entries no longer depend on which API you used.**
  Creating or updating a company through GraphQL or MCP now appears on the
  activity timeline, updates record which fields changed, and an update that
  changes nothing no longer leaves a misleading "updated" entry. Audit entries
  for updates now carry the changed field names on every surface.

- **GraphQL deletes now clean up related data.** Deleting a contact or a company
  through the GraphQL API removes the record's notes and activities, and detaches
  contacts and deals from a deleted company — matching what the REST API and the
  MCP server have always done. Previously the GraphQL path left orphaned notes
  and activities behind, and left contacts and deals pointing at a `companyId`
  that no longer existed.

  Existing damaged rows are **not** cleaned up automatically. If you have ever
  deleted a contact or company over GraphQL, these queries count what was left
  behind (run them per workspace, or drop the `workspace_id` filter to scan all):

  ```sql
  -- notes/activities pointing at a contact or company that no longer exists
  SELECT 'notes' AS table, count(*) FROM notes n
   WHERE (n.entity_type = 'contact' AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = n.entity_id))
      OR (n.entity_type = 'company' AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.id = n.entity_id))
  UNION ALL
  SELECT 'activities', count(*) FROM activities a
   WHERE (a.entity_type = 'contact' AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = a.entity_id))
      OR (a.entity_type = 'company' AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.id = a.entity_id));

  -- contacts/deals pointing at a company that no longer exists
  SELECT 'contacts' AS table, count(*) FROM contacts c
   WHERE c.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.id = c.company_id)
  UNION ALL
  SELECT 'deals', count(*) FROM deals d
   WHERE d.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.id = d.company_id);
  ```

  Deciding what to do with those rows is yours — deleting data is not something
  an upgrade should do on your behalf.

## Mô tả từng PR

### #1 feat(ai): AI-native strategy (ADR-015) + Tier 1/2/3 implementation

Nhánh `claude/app-twenty-comparison-fgpl5z` → `main`; tạo 2026-07-09; merge 2026-07-09.

#### Summary

Adds the **AI-native strategy** (ADR-015) and implements all three of its tiers. The thesis: don't clone Twenty's AI platform — be the best **substrate for external AI** + deterministic intelligence, and offer generative only as an opt-in, privacy-preserving adapter.

#### What's included

**ADR-015 — strategy** (`docs/adr/015-ai-native-strategy.md`)
- Assesses Twenty 2.0's AI limitations (non-determinism, per-token cost, external-provider/privacy dependency, lead-scoring still "coming soon", AGPL friction) and records the decision + guardrails.

**Tier 1 — be the best substrate for external AI**
- MCP tool catalogue grows **10 → 20**: full CRUD for contacts/companies, deal create/update/delete, tasks, notes. Delete tools are **dry-run unless `confirm: true`**.
- New **HTTP MCP transport** at `POST /api/mcp` (Bearer key or session; single or JSON-RPC batch) reusing the same `handleMcpRequest` as stdio — RLS + RBAC + field-permissions enforced identically.
- MCP **resources** (`fourty://dashboard`, `fourty://custom-objects`) and **prompts** (`summarize_pipeline`, `draft_followup`).

**Tier 2 — deterministic intelligence (no LLM)**
- **Deal health / win-likelihood score** (`src/lib/deal-scoring.ts` + `src/lib/services/deal-score.ts`), migration `0011` adds `deals.score` (reversible), wired into the deals REST routes and the MCP deal tools.

**Tier 3 — optional generative (off by default, BYO-key, human-in-the-loop)**
- `src/lib/ai`: provider-agnostic client (Anthropic / OpenAI / **local Ollama**) as thin `fetch` calls — no heavy SDK, preserving the ~10-dependency ethos. Enabled only via `FOURTY_ENABLE_AI=1` + a provider key; with AI off, no CRM data leaves the box.
- New `ai_draft` workflow action → durable `ai.generate` job → worker writes the result as a **draft note** (never a record mutation), `authorId=null`, audited `meta.via="ai"`.

#### Verification
- Full suite **206 tests pass** (was 185); `tsc --noEmit` clean; `next build` green.
- HTTP MCP transport driven end-to-end (20 tools, resources/prompts, dry-run/confirm delete, unauth → 401).
- Deal scoring wired in REST + MCP (`create_deal` returns a score; won stage → 100).
- Tier 3 generative path verified end-to-end against a **local model server** (draft note written with `via:"ai"` audit).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JpJvThYgEJWSgMcUGCQTDo

---
_Generated by [Claude Code](https://claude.ai/code/session_01JpJvThYgEJWSgMcUGCQTDo)_

### #2 feat(ui): adopt shadcn/ui on Base UI and rebuild the app shell

Nhánh `claude/intelligent-stonebraker-def72a` → `main`; tạo 2026-08-09; merge 2026-08-09.

Brings the current shadcn/ui into Fourty: the vendored component layer, an
icon-collapsible app shell, and the modal/palette moved onto real primitives.

Researched against the live CLI and registry API rather than from memory — two
findings changed the plan:

- **`shadcn doctor` does not exist.** CLI is v4.16.2; the real diagnostics are
  `shadcn info`, `registry validate`, `add --dry-run` and `add --diff`.
- **Base UI has been the default primitive layer since July 2026**, not Radix
  ([changelog](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)).
  So `init` ran with `-b base`. The idiom differs: `render` prop, not `asChild`.

#### What landed

| Area | Change |
|---|---|
| Foundation | `init -b base -p vega`, 33 components incl. all eight from late 2025 (`spinner`, `kbd`, `button-group`, `input-group`, `item`, `empty`, `field`, `native-select`) |
| Token bridge | shadcn's semantic names declared as **aliases** of the Fourty palette |
| Shell | `sidebar-07` — collapses to icons, tooltips, state persisted via `sidebar_state` cookie read server-side |
| Primitives | `Modal`→Dialog, `EmptyState`→Empty, `Spinner`, `Avatar`; palette→cmdk |

`init` had overwritten `--border` with a neutral gray and `--primary` with near
black, discarding the indigo brand. `globals.css` now declares the Fourty palette
first and shadcn's names purely as aliases, so a stock `shadcn add` lands already
wearing the brand.

#### Defects this port introduced, and how they were caught

1. **The account menu crashed the whole app.** `DropdownMenuLabel` maps to Base
   UI's `Menu.GroupLabel`, which throws outside a `Menu.Group`; adapting
   `nav-user` dropped its `DropdownMenuGroup`. Typecheck and build were both
   green — only e2e caught it.
2. **The sidebar lost its `<nav>` landmark.** shadcn's sidebar parts are all
   divs. Silent for sighted users; caught by `tests/a11y.test.ts`.
3. **`Modal` opened without focus, which silently disabled Escape**, because
   Base UI binds Escape to the focused popup. `autoFocus` does not work here —
   the popup is a div — so a ref plus one animation frame restores both.

#### Reviewer note

`CLAIMS.md` is a ground-truth ledger, and shadcn brings six runtime packages, so
**"~10 runtime dependencies" stopped being true**. The claim now reports 16 and
reframes the argument around services you operate rather than package count.
That is a marketing-facing change and the thing most worth a second opinion.

#### Verification

- `tsc` clean; `npm run build` green, 80 routes
- Unit: **574 passed, 2 skipped, 57/57 files**
- E2E: **17/17 passed**
- Driven by hand in a browser: login, dashboard, contacts, settings,
  icon-collapse + persistence across a full reload, ⌘K → filter → Enter →
  navigate, Escape, account menu, New-contact modal

Each of the four commits is independently green — `tests/a11y.test.ts` has
changes belonging to three of them, split so no commit lands red.

Local Postgres on 5432 belongs to another project here; Fourty's is on 5433. The
suites need `TEST_DATABASE_URL` / `REVTEST_DATABASE_URL` pointed there — see the
[report](plans/reports/shadcn-adoption-260809-1000-base-ui-sidebar-07-foundation-report.md).

#### Open questions

1. shadcn `chart` pins `recharts@3.8.0`; we are on `^3.9.2`. Green today, latent
   conflict if `chart` is adopted.
2. The sidebar binds **⌘B** to toggle — new global shortcut, acceptable?
3. Typography changed to **Inter** via `next/font/google` (self-hosted; a build
   now needs network). Keep, or revert to the system stack?
4. `vitest.config.ts` / `playwright.config.ts` default to port 5432 — worth
   changing the default, or is the env override the intended workflow?

#### Not in scope

~277 uses of `.btn-primary`/`.card`/`.input`/`.th`/`.td` across 55 files still
work through the token bridge and are untouched. `icons.tsx` still serves
un-migrated pages, so icon sets are mixed until those move. `charts.tsx` still
uses raw recharts. `Field` stays hand-rolled — shadcn's `FieldLabel` is
`flex w-fit` and fights the full-width inputs these forms use.

### #3 docs: re-verify Fourty against trycompai/crm and fix three stale claims

Nhánh `claude/feature-repo-inventory-compare-2c8bdd` → `main`; tạo 2026-08-09; merge 2026-08-09.

The competitor teardown behind the agentic upgrade was written on 2026-08-08, against
Comp AI's **v1.4.0** and against Fourty *before* Phases 0–4 landed. Both sides have
moved since, so neither half of that document is safe to quote today.

This re-reads their `release` tree at **v1.5.1** and re-checks every gap row against
`src/**`.

#### What the re-verification found

**Six of the nine gaps are closed** — autonomous background work, the evidence model,
mail→facts, the per-record agent UI, capability awareness, and non-dead-end reads all
have code behind them now, in one process with zero new runtime dependencies.

Of the three that remain:

- **Enrichment vendors** — refused on principle, not missing by accident.
- **Custom agents** — gated on an ADR-016 amendment, not on code.
- **Model-as-config** — the one gap genuinely open. `src/lib/ai/provider.ts` reads
  `AI_*` from env only, though a `settings` table already exists.

The old framing "they have the agent, we have the platform" is out of date: Fourty now
has the agent's *safety machinery* plus the platform, and still exposes the whole
surface over MCP, which they cannot.

#### Stale claims corrected

Three doc claims were checked against source and found wrong:

| Doc | Said | Code |
|---|---|---|
| `README.md:78` | five workflow action types | six (`ai_draft` was never counted) |
| `PARITY.md:76` | MCP has 10 tools | 26 (`src/mcp/tools.ts`) — every other doc already said 26 |
| `PARITY.md:77` | "Round-1 slice … no per-record/async agent yet" | false since Phases 0–4 |

A second reader also corrected three counts in the report itself before it was
committed: 7 Playwright specs (not 9 — `auth.setup.ts` is a setup project), 19 ADR
decisions (not 20 — the twentieth file is the README index), and ADR-019's scope, which
covers mailbox OAuth tokens and ICS feed URLs but **not** AI keys. That last one is why
model-as-config needs its own ADR rather than an extension of 019.

#### Decisions recorded

1. **Model-as-config** — accepted, but later and narrow: non-secret knobs to `settings`
   with env fallback, the API key stays out of the database. Needs ADR-020.
2. **Phase 5 (custom agents)** — closed for this release. No ADR-016 amendment until
   custom agents are an explicit product priority.
3. **Phase 3b (model-backed lane)** — deferred until the keyless pass has run on real
   mail and we have signature precision and Accept-rate numbers.
4. **`PARITY.md` stays Twenty-only** — Comp AI keeps its own dated report and cadence.

#### Scope

Documentation only — no source, schema, or test changes.

Their side was re-read from the published tree rather than cloned and run: enough for a
feature comparison, not enough to support a benchmark or behavioural claim.

### #4 test(sync): fix the flaky token-leak assertions

Nhánh `fix/sync-test-token-fixtures` → `main`; tạo 2026-08-09; merge 2026-08-09.

`test-and-build` failed on `main` at `4eb7155`, one test out of 608:

```
FAIL tests/sync.test.ts > callback verifies state, exchanges the code, and stores tokens
AssertionError: expected '{"refreshToken":"enc:v1:qFlpax2T3lTKK…' not to contain 'r2'
```

**The sealing was fine.** The assertion was not.

The fixture refresh tokens were two characters (`"r1"`, `"r2"`), and three
assertions searched sealed output for them. Sealed output is random base64, so a
two-character needle turns up inside its own ciphertext by chance:

```
enc:v1:qFlpax2T3lTKKbgDbb1r2W9uN9ChBGhCV8l4bxdt
                        ^^
```

Measured over 200,000 seals with the real `seal()`:

| Fixture | Falsely fails |
|---|---|
| `"r2"` (before) | **0.952%** of runs — about 1 in 105 |
| long fixture (after) | 0 in 200,000 |

#### Why this is worth a commit rather than a re-run

The passing runs were no better than the failing one. A needle that short cannot
distinguish a leak from a coincidence **in either direction** — had the refresh
token genuinely leaked in the clear, a 2-character match would have been just as
likely to come from the ciphertext as from the leak. The assertion was not
checking what it claimed to check on any run, green ones included.

Three sites were affected, not just the one that happened to fire:
`sync.test.ts:441` (sealed at rest), `:478` (the failing one), `:619` (API must
not echo config).

`secrets.test.ts` and `rekey.test.ts` already use a long, distinctive fixture
(`refresh-token-fixture-not-a-real-credential`) for exactly this reason. These
now follow the same convention.

#### Verification

- `tests/sync.test.ts` — 31/31 pass locally against `postgres:16` configured to
  match CI.
- `npx tsc --noEmit` — clean.
- The 0.95% → 0% measurement above, using the production `seal()`.

Test-only change; no production code, schema, or behaviour touched.

### #5 feat(brand): add the Fourty logo and brand guidelines

Nhánh `claude/design-modern-opensource-logo-117379` → `main`; tạo 2026-08-09; merge 2026-08-09.

Replaces the placeholder brand assets with a drawn identity, and documents it.

#### The mark

A **"40" monogram**. The `4` is Inter Display ExtraBold outlined; the `0` is a **true circle**, not the font's oval, overshooting the cap band and set to just touch the 4's crossbar. That one substitution keeps the letterform anatomy correct while giving the mark a geometric silhouette that survives to a 16px favicon.

Six directions were drawn and rendered at 16–176px before this one; the aperture and split-ring concepts did not read as "40", and stencil-gap variants turned the `0` into a `D`.

#### What ships

| File | Use |
|---|---|
| `public/icon.svg` | Favicon + PWA tile — replaces the `<rect>`-plus-`<text>` placeholder. Already wired via `layout.tsx` and `manifest.ts`, no config change needed. |
| `public/logo.svg` / `logo-dark.svg` | Lockups, light and dark |
| `public/logo-mark.svg` | Mark alone |
| `src/components/logo-mark.tsx` | Inline mark, takes `currentColor` |

All hand-authored SVG, under 2 KB each, no runtime font dependency. The SVGs are the source of truth — no design file to sync, no build step.

`src/components/app-sidebar.tsx` carried the same hand-typed `40` placeholder; it now renders the mark inline.

#### Docs

New `docs/design-guidelines.md`, linked from the docs index:

- Geometry table with every number needed to redraw the mark
- Clear space, and minimum sizes found by rendering the real files down a size ramp
- Colour pairs with measured contrast — including why `logo-dark.svg` exists as a separate asset: the light-mode indigo measures **3.04:1** on `#0b0f1a`, under the 4.5:1 floor. The dark lockup lifts the mark to accent-400 for 6.41:1.
- **Trademark**: code stays MIT, the name and mark are reserved. `LICENSE` is untouched; the reservation lives in the doc, with a pointer from the README's License section.

#### Checks

- `npx tsc --noEmit` — clean
- `npx vitest run tests/a11y.test.ts` — 10/10; the sidebar's accessible name is unchanged and the SVG is `aria-hidden`
- All four SVGs parse as valid XML; every relative link and heading anchor in the new doc resolves
- Rendered and eyeballed at 128 / 64 / 48 / 32 / 24 / 16 px, both themes, plus mocked README headers

#### Note

`LICENSE` reads `Copyright (c) 2026 Fourty contributors`. Enforcing a name/logo reservation usually needs a named holder — worth deciding separately.

### #6 Adopt the brand palette and the real logo artwork

Nhánh `design/brand-palette-adoption` → `main`; tạo 2026-08-10; merge 2026-08-10.

Brings the product's look in line with the brand: the palette, the logo, and the contrast work that turned out to be needed once both were real.

#### What changed

**Palette.** The accent was a placeholder indigo and the neutrals were cool slate. Both now come from the brand: a full oklch ramp built on the mark's own orange, warm stone neutrals on the same hue axis, Archivo Expanded as the display face, and named motion tokens with a real reduced-motion alternative.

**Logo.** The app drew its own — a rounded square in the accent colour with "40" set in the UI font. It was lettering rather than the mark, and it sat on the brand orange, which is the one ground the lockup may never use because the O *is* that orange. `brand/logo-master.svg` is now the only hand-maintained drawing; `npm run build:brand` splits it into the two lockups and writes the geometry module, the exported files and the app icon.

Two variants: `full` for anything with width, `compact` (the 40 monogram) for square and narrow surfaces — so the sidebar shows the full lockup expanded and the monogram on the 3rem rail.

**Contrast, measured rather than assumed.** On this orange white reaches 3.04:1 and the artwork's ink 5.36, so filled accent controls carry ink and accent-coloured text drops to step 700. Data-coloured text (pipeline stages) was theme-blind — a value darkened for white was rendered on a near-black surface at 3.85:1 — and a chip's ground is its own wash, not the surface, which is stricter. Every static chip was failing in light mode; priority "medium" measured 2.70:1. Worst case across pages and themes is now 4.66:1.

**Also:** charts read the palette off the document instead of hardcoding hex, and in a layout effect so they never paint black for a frame; the favicon flips ink with `prefers-color-scheme`; stage colours move to the warm ladder with a reversible migration for the column default.

#### Verification

- `tsc --noEmit` exit 0
- `next build` exit 0
- 621 unit tests pass (61 files), including the extended migration-reversibility chain now covering 0015–0017
- 17 Playwright e2e pass
- Contrast swept across 8 page × theme combinations, no failures

#### Design system

`.design-sync/` carries the inputs that regenerate the claude.ai/design project from this repo — export surface, compiled stylesheet entry, 42 authored previews, and the conventions header the design agent reads.

### #7 Ship the designer's lockup, then put every control on one implementation

Nhánh `design/logo-artwork-v2` → `main`; tạo 2026-08-10; merge 2026-08-10.

The logo master committed in #6 was a trace, not the designer's file. Replacing it with the supplied export turned up two further problems in the same family, so this branch closes all three and the gap in the test suite that let them through.

#### The artwork was off by a couple of units everywhere

Transcribing the real Illustrator export turned up drift in every path: the wordmark sat 2.7 units high, the compact `O` 2 units low. Small enough that nobody would name it, big enough that the monogram and the full lockup did not share a baseline. All seven paths are now the export verbatim.

#### The frame clipped the artwork

Measured with `getBBox()` in headless Chromium, the full lockup's artwork reached y 302.3 while its `viewBox` said 302 — so 0.3 of the R's leg fell outside the frame in every generated asset and in `<Logo>`.

That number came from the export, and an Illustrator artboard is not a bounding box. The same designer's compact file proves it from the other side: 304 of frame around 302 of artwork. One artboard rounds up, the other rounds down, and `build-brand-assets.ts` had copied both by hand as literals.

So the master carries the measured extent, and the build reads its frame from there instead of restating it. Both lockups share that height, which is what keeps the baseline still when a responsive surface swaps the full lockup for the monogram at a fixed height.

#### The R was the one glyph off the baseline

With the frame honest, the 0.3 stood out for what it was: six shapes ending on 302 and the R's leg alone hanging below. Optical overshoot would explain it on a round glyph, but the O — the shape that would actually earn one — stops dead at 302, so nothing in this artwork uses overshoot.

Confirmed with the brand owner, the leg's last segment is now `l65.6,77.9` where the export had `l65.6,78.2`. Measured before and after: the R's top, left and right are identical and only its foot moved. This is the one coordinate in the file that differs from the export, and the master's header says so.

With every shape on 302, the frame is 302 — the number both supplied files disagreed with, now arrived at by measuring rather than by copying.

#### One typeface, not two

Archivo was standing in for a wordmark typeface that was never supplied. With the real artwork in hand the question answers itself: the lockup is drawn geometry, and its letterforms have nothing to do with the product's. A second family was echoing nothing while costing a font fetch on every brand surface.

`--font-display` now points at `--font-sans`, and `layout.tsx` stops loading Archivo. The role name stays deliberately — it says *where* something belongs, so naming a real display face later is one line in `globals.css` and one in `ds-css-entry.css`, with nothing downstream to change.

#### Why the suite never caught any of it

It counted shapes and compared none of them. The traced logo had the right *number* of paths carrying the wrong coordinates, so every assertion stayed green. Dimensions were checked only for being greater than zero.

Two assertions close that: every coordinate is compared against the master, and both lockups' frames are tied to the master's `viewBox`. Verified by mutation — a nudged vertex and a stale height each fail the intended test, and the old counting assertion stays green through both.

#### Verification

- `vitest` — 63/63 files, 654 passed
- `playwright` — 17/17, against a real `next build`
- `tsc --noEmit` — clean
- `npm run build:brand` — idempotent against the master
- Every lockup measured to fit its frame with zero slack; the favicon centres evenly

#### Also here

`.design-sync/NOTES.md` records what the re-sync alongside this work cost to learn: the two flags without which the converter cannot start, the two card families nothing in the pipeline reminds you to rebuild, and the fact that `sourceKeys` track a component's own file rather than its imports — which is why `Logo`, the one component this work existed to change, was reported unchanged and carried its grade forward.

The Design System project is synced to this branch's build: 884 files, render check 196/196 clean.

---

### Then: one implementation for every control, one measured colour system

The branch carried on past the lockup. Fourty was measured against the 58 gates
published at usehallmark.com, and the audit found the product shipping two of
several things at once.

`.card` had 47 call sites and `<Card>` had none, so the exported design system in
`ds-bundle/` described a library the product did not render — and a fix applied to
one implementation missed the other, which is how a bordered control came to stand
2px taller than its unbordered sibling. Alongside it, 54 raw Tailwind palette
utilities across 17 files routed around a semantic token layer that exists
precisely so colour pairs get measured.

**Six of those pairs were below AA.** The worst carried the stale-deal figure at
2.13:1; two settings banners announced themselves at 2.95:1; two error bubbles had
no dark variant and fell to 3.37:1 on the dark surface. The worst pair shipping now
is 4.66:1, and `tests/semantic-tokens.test.ts` re-measures the new
`--feedback-{ok,warn,error}` family per theme so a hand-edit fails there rather than
in front of a user.

#### What moved

- **197 call sites** onto `<Button>`, `<Input>`, `<NativeSelect>`, `<Textarea>` and
  `<Card>`; `.btn-*`, `.input` and `.card` are gone from `globals.css`. Every
  form-row control is 36px, border included.
- **162 table tags** onto `Table` and its parts, which now carry this product's
  table language rather than the library's defaults — and deliberately no row
  hover, because half these tables are reports nobody can click.
- Focus rings out of the transition set. A ring that fades in over 150ms leaves a
  keyboard user with no indicator while it arrives.
- `useConfirm()` replaces nine `window.confirm` calls — the one surface no token
  reaches, and one that cannot say which button is destructive.
- `icons.tsx` becomes a thin adapter over Lucide. The hand-drawn set was already
  drawn to Lucide's grid and stroke, so this was one voice maintained twice.
- `font-display` is applied to the page title and the KPI figure. One typeface
  stands — that call is the brand owner's and is on record — but the role now names
  a surface, so adopting a display face is a one-line change.

#### Three defects this branch introduced and then caught

Recorded because each one says something about what the tests could not see.

1. **The workflows list stacked its rows into a column.** `Card` shipped
   `flex flex-col`, and `flex-row` is the only class in tailwind-merge's
   flex-direction group — so a caller asking for a row could not take the direction
   back. Unit tests, e2e and the production build all went green over a visibly
   broken page, because nothing asked whether a view was standing up.

2. **Seven navigations became buttons rendered as anchors**, which put
   `type="button"` on an `<a>` — where `type` is the MIME type of the target — and
   withheld the role. The settings spec had guarded exactly this for months
   ("asserting the control is a link is what stops a future tidy-up turning it into
   a button"); it stayed green only because Base UI emitted no role at all, leaving
   the anchor its implicit one.

3. **A bordered control with no border**, for one iteration: `buttonVariants()`
   without `cn()` leaves the base's `border-transparent` beside the variant's
   `border-border`, and stylesheet order decides. No assertion caught that one —
   looking at a screenshot did.

#### What the suite can see now

- `e2e/views.spec.ts` — every view and detail page must render its heading, report
  nothing to the console, and show none of three states that announce themselves
  nowhere else: horizontal overflow, a flex column that is also told to wrap, or a
  visible control with no accessible name.
- `e2e/workflows.spec.ts` — the view that had no coverage at all.
- **`npm run test:e2e:dev`** — the production suite is structurally unable to see a
  framework development warning, because they are stripped from that bundle. This
  one boots `next dev` and fails on any console output at all.

Every check was proved by reintroducing a real defect and watching it go red. That
mattered: the first draft of `views.spec.ts` passed while the workflow row was still
visibly stacked, because it asserted before the client-side fetch had landed.

#### Not done

- **Undo rather than confirmation** for the reversible deletes — needs restore
  endpoints the API does not have. The dialog replaces the mechanism, not the
  behaviour.
- **A second typeface.** Declined, with reasons on record.
- `CardHeader` / `CardContent` / `Badge` have no call sites; the product's badge API
  is the three semantic chips, and they are used.

Full audit: `plans/reports/hallmark-design-audit-260810-1709-design-system-vs-58-gates-report.md`.
Migration record: `plans/260810-1728-primitive-layer-consolidation/plan.md`.

### #8 Remove the lint script that never ran

Nhánh `chore/remove-dead-lint-script` → `main`; tạo 2026-08-10; merge 2026-08-10.

`npm run lint` did not lint. It called `next lint`, which Next 16 removed, so Next read `lint` as a directory argument and exited with `no such directory: /…/fourty/lint`.

Repairing it would have meant inventing a linter rather than fixing a command. There is no `eslint` dependency in `package.json`, no config file of any flavour in the repo, and no CI step that ever invoked it — this was `create-next-app` scaffolding that nobody wired up. `CLAIMS.md` has carried it as a known-broken item across two audits.

So the script is gone rather than repaired. What actually gates static correctness here is `npx tsc --noEmit`, which CI already runs ahead of the suite, alongside 652 tests and `tests/source-hygiene.test.ts`.

This does not close the door on linting. Adding ESLint to ~200 components is a real decision with a real triage cost, and it deserves its own PR and its own argument. What it should not be is a command that fails on contact while a docs table claims it works.

#### Also updated

- `CLAIMS.md` — the gaps table entry is closed with its reasoning, and the summary line below it now counts one open item from the previous audit instead of two.
- `docs/reference/cli.md` — the command table listed `npm run lint | Lint with next lint`. Replaced with a note naming `tsc --noEmit` as the static gate.

#### Verification

`npm run lint` now exits with npm's own "missing script", which is the honest answer. `package.json` parses; the other 19 scripts are untouched.

### #9 Deliver invites by email and add a page to redeem them

Nhánh `claude/droplet-dokploy-deploy-d904b5` → `main`; tạo 2026-08-28; merge 2026-08-28.

Inviting a teammate created a token and left it there: an admin copied it out of the settings panel and passed it along by hand, and there was no page to redeem it — the invitee had to POST to `/api/members/accept` themselves.

#### What changed

**`/accept`** — outside the `(app)` group, since the visitor is not a member yet. A stranger gets a name + password form (the token authorizes the signup, and accepting creates the session too); someone already signed in gets a single confirm button; an invited address that already has an account gets a prompt to sign in rather than a dead end.

**Email delivery** — the link is sent over SMTP when configured, through a `mail.send` queue job so a slow or unreachable server stays off the request path and retries with backoff. Off unless `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` are all set, matching how the AI and OAuth layers stay dormant until configured. With it off the panel shows the link, exactly as before. The token is returned either way, so a failed send never costs an invite that is already committed.

Plain SMTP rather than a provider SDK: sending through the mailbox that already handles the domain's mail leaves SPF and DKIM untouched.

#### Verification

- Unit: 649 passed
- E2E: 37 passed, including a new spec that invites, redeems the link in a separate browser context, and replays the same link to prove the token is single-use
- Typecheck clean

#### Notes

- `tests/members.test.ts` claimed the accept flow was "covered by the live E2E". It was not — nothing under `e2e/` touched `members/accept`. It is now.
- The queued job carries the raw token, so it sits in the pgboss tables until the job is archived, while `invites` keeps only a hash. Not an escalation (anyone who can read those tables can read `sessions`), but noted at the enqueue site.
- An invited address that already has an account still has to sign in and reopen the link; wiring `?next=` through `/login` would remove that step and is deliberately left out of this change.

### #10 Add an HTTPS mail transport for hosts that block outbound SMTP

Nhánh `claude/droplet-dokploy-deploy-d904b5` → `main`; tạo 2026-08-28; merge 2026-08-28.

The SMTP transport shipped in #9 cannot work on a DigitalOcean droplet: DO blocks outbound ports 25/465/587 by default.

Confirmed on the host rather than assumed — every SMTP port to every provider times out, while general egress is fine:

| Target | Result |
|---|---|
| `smtp.larksuite.com` 25 / 465 / 587 / 2525 | timeout |
| `smtp.gmail.com` 465, 587 | timeout |
| `smtp-mail.outlook.com` 587 | timeout |
| `smtp.exmail.qq.com` 465 | timeout |
| `github.com:443`, `cloudflare:443`, `1.1.1.1:53` | open |

Timeouts rather than refusals — the packets are dropped upstream of the machine, so no local firewall change undoes it.

#### What changed

Resend over port 443 as a second transport, selected when `RESEND_API_KEY` is set and SMTP is not. **SMTP still wins when both are configured**: sending through the mailbox that already serves the domain needs no DNS change, which the HTTPS route does.

`MAIL_FROM` is required with Resend and only optional with SMTP — there is no account address to fall back on — so a key without a From logs why it is staying disabled instead of failing later at send time.

`Mailer.host` becomes `Mailer.transport`, since "host" no longer describes both.

#### Verification

- Unit: 657 passed (8 new, covering transport selection, the exact Resend request, and that a refusal throws with the API's own explanation so the job retries and the reason is visible)
- E2E: 37 passed
- Typecheck clean

#### Note on DNS

Resend's suggested `send.` subdomain carries its own SPF, so verifying it leaves the **root** domain's SPF untouched and existing mail is unaffected — but `MAIL_FROM` then has to match that subdomain. Verifying the apex instead would mean merging Resend into the existing root SPF record, since a domain may publish only one.

### #11 Add a password reset script for locked-out instances

Nhánh `claude/reset-password-script` → `main`; tạo 2026-08-28; merge 2026-08-28.

Fourty has no forgot-password flow, and cannot have a useful one at the moment it is most needed: on a fresh install there is nowhere to send a reset link, and the first account exists before any mail is configured. One lost admin password locked an instance out permanently — `grep` across `src/` and `scripts/` turned up no reset route and no script.

#### What changed

`npm run reset-password -- <email>`, following the `rekey` shape: logic in `src/lib/auth.ts`, a thin CLI in `scripts/`.

- The password is typed at a prompt and **never echoed**, keeping it out of the shell history and the process list. Piping works too for automation, and skips the confirmation prompt since a pipe cannot answer one.
- **Existing sessions are dropped in the same transaction** as the password change. A reset usually responds to a password someone else may know, so live cookies must not survive it — and doing the two separately would leave a window where the new password is set but old sessions still work.
- Reuses `hashPassword()` rather than reimplementing scrypt, so the stored hash always matches what sign-in expects, and shares the 8–200 character bounds with the signup routes.

#### Verification

- Unit: 661 passed, including 4 new — the old password stops working, sessions are gone, an unknown address returns false rather than silently doing nothing, and a rejected password leaves the old one working.
- CLI exercised end to end against a real database: usage error, unknown address, and a successful reset whose hash verifies against the new password while the sessions row count drops to zero.
- E2E: 37 passed (`src/lib/auth.ts` is shared with login/setup/accept).
- Typecheck clean.

#### Note

Anyone who can reach the database can reset a password, which is the same trust boundary as the server itself — not an escalation, and documented as such in `docs/self-hosting/operations.md`.

### #12 Forgot-password over email

Nhánh `claude/forgot-password` → `main`; tạo 2026-08-28; merge 2026-08-28.

The CLI reset from #11 needs server access, which regular users don't have. With outbound mail available (#10) there is finally somewhere to send a link, so this adds the self-serve path.

#### Flow

`/forgot` (request a link) → email with a one-hour token → `/reset?token=…` (choose a new password) → `/login`. The login page offers **Forgot your password?** only when mail is configured; without a transport `/forgot` explains the situation instead of offering a dead form.

#### Security decisions

- **No account enumeration**: identical 200 for known and unknown addresses, and the unknown case logs at debug so even the log isn't a signal. One generic error covers unknown/expired/used tokens.
- **Token treatment mirrors invites**: sha256 at rest, raw value only in the emailed link. 1-hour TTL (vs the invite's 7 days — a reset link's only job is to be clicked promptly).
- **Single-use, race-safe**: the burn is an `UPDATE … WHERE used_at IS NULL … RETURNING`, so two concurrent redemptions have exactly one winner. Burn-then-set ordering means a crash between the two leaves a dead token, never a replayable one.
- **One live link at a time**: issuing a new token deletes the user's unused ones.
- **Sessions die with the password**, via the same `setPassword()` transaction the CLI path now uses (extracted, not duplicated).
- **Rate limits**: 5/15min per IP for sends (each is an email), login's 10/15min for redemptions.

#### A bug the tests caught

In inline queue mode the mail job runs in-request, and its idempotency receipt lands in the RLS-scoped `job_receipts` table — which needs an ambient workspace id that pre-auth routes don't have. The invite route never hit this because it runs inside `withAuth`. The forgot route now wraps its enqueue in `withWorkspace(IDENTITY_SCOPE)`; the sentinel can't collide with real ids (`newId()` is always 16 chars) and `job_receipts` has no FK.

The static guard in `tests/api-auth.test.ts` flagged both new routes as missing auth — correctly. They're declared in its public-route allowlists with justification, the same treatment as `members/accept`.

#### Verification

- Unit: 667 passed, 6 new — full round trip via the real route handlers (request → parse link from captured mail → redeem → old password dead, sessions gone), enumeration answer, replay refused, old-link-retired-by-new, expiry, mail-disabled no-op.
- E2E: 41 passed, 4 new — login hides the link without mail, `/forgot` explains itself, `/reset` without token, bogus token gets the generic error.
- Migration follows the hand-written convention (0011+): SQL + journal entry. `db:generate` has a pre-existing snapshot collision and was not usable.
- Typecheck clean.

### #13 Carry an invite through sign-in with a guarded ?next=

Nhánh `claude/login-next-redirect` → `main`; tạo 2026-08-28; merge 2026-08-28.

Closes the UX gap noted in #9: an invitee whose address already had an account was told to sign in and then open the invite link from their email *again*. The hand-off now carries the accept URL in `?next=`, so signing in lands them straight back on the invite.

#### Open-redirect guard

A login page that forwards wherever its query string points is an open redirect. `safeInternalPath()` (in `src/lib/utils.ts`, unit-tested) drops absolute URLs, protocol-relative `//host`, backslash variants browsers normalise off-origin, and anything not starting at `/`. One call site: the page validates, the form just pushes what it was given. A signed-in visitor arriving at `/login?next=` goes through the same guard.

#### Verification

- Unit: 672 passed (5 new for the guard).
- E2E: 42 passed **twice in a row**, including a new round trip: invite an existing address → guest submits the signup form → 401 hand-off → sign in → back on the invite → join → dashboard.
- The new spec flushed out a latent locator bug: bare `{ name: "Invite" }` is a substring match for the "Remove E2E **Invite**e" row control, so the locator went ambiguous the moment the first spec's member rendered — green or red depending on whether the click beat the member fetch. Pinned with `exact: true` in both specs.

### #14 Repair the drizzle snapshot chain so db:generate works again

Nhánh `claude/repair-drizzle-meta` → `main`; tạo 2026-08-28; merge 2026-08-28.

`npm run db:generate` has been unusable: snapshots 0004..0010 were byte-copies of 0003's identity (same `id`, same `prevId`), and drizzle-kit rejects the meta directory as a parent collision. Every schema change since 0011 has been hand-written SQL with nothing checking it against `schema.ts`.

#### What changed

- **Chain relinked**: fresh ids for the duplicated snapshots, each `prevId` pointing at its real parent.
- **A 0018 snapshot reflecting the current schema** (35 tables), so generate diffs against reality. Snapshots for 0011..0017 stay absent — they never existed, only the newest snapshot participates in diffing, and inventing history for migrations that were never generated would document a provenance they don't have.
- **No runtime artifact**: no new migration, nothing for production to run. (`generate --custom` turned out to copy the *previous* snapshot rather than introspect the schema, so the working snapshot came from a real generate whose SQL was discarded.)

Verified both directions: a clean tree produces "No schema changes", and a trial column produces exactly one correct `ALTER TABLE` (trial reverted).

#### A gap this exposed

`0018_password_resets` (#12) shipped without a down file and without joining the reversibility test's hardcoded UP/DOWN lists — so "full chain" quietly stopped covering the newest migration while staying green. Fixed: the down file exists, the lists include 0018, the table-count assertions moved 34→35, and a new guard asserts the lists match the migrations on disk. The next migration that skips its down turns the suite red instead of silently shrinking it.

#### Verification

- Unit: 673 passed, including the reversibility chain now walking 0000..0018 up, down to empty, and back to an identical fingerprint.
- No runtime code touched.

### #15 Build emailed links and OAuth redirects from the forwarded host

Nhánh `claude/fix-origin-behind-proxy` → `main`; tạo 2026-08-28; merge 2026-08-28.

Found by the first real-inbox test of the invite flow: the mail arrived in Gmail, rendered correctly — and its accept link was `https://localhost:3000/accept?token=…`.

Behind cloudflared, Next reconstructs `req.url` from its bind address, so **every** absolute URL the app mints was wrong on this deployment: invite links, password-reset links (the earlier forgot mail carried a dead link too), SSO redirect URIs, and mailbox-OAuth redirect URIs. No test tier could catch it — every test environment talks to the app directly, where `req.url` happens to be right.

#### Fix

`requestOrigin(req)` in `src/lib/api.ts`: `x-forwarded-host` → `Host` → URL fallback, proto from `x-forwarded-proto` (first hop) → URL. All six `new URL(req.url).origin` call sites replaced (invite, forgot, SSO start/callback, sync connect/oauth-callback).

Trust rationale in the doc comment: behind a proxy these headers are proxy-controlled; exposed directly, Host is what TLS/routing already validated; a spoofed Host only changes the link in mail the spoofer requested for an address they typed.

#### Verification

- Unit: 677 passed (4 new: forwarded-host, cloudflared's Host+x-forwarded-proto shape, direct fallback, multi-hop proto list).
- E2E: 42 passed (direct exposure — the fallback path).
- The real-world proof comes after deploy: a fresh invite to the same Gmail inbox must carry `https://crm.example.com/accept?…`, verified in the Resend message view.

### #16 Tell the admin the invite mail may be in spam

Nhánh `claude/invite-panel-spam-hint` → `main`; tạo 2026-08-28; merge 2026-08-28.

One-line copy change, grounded in a real-inbox finding: a cold sending domain lands in Gmail's spam folder even with SPF/DKIM/DMARC all passing aligned and SpamAssassin at −0.1 (verified via mail-tester and a fresh-mailbox probe). Reputation warms with time, not configuration — so the invite panel's fallback line now names the spam folder, letting the admin nudge the invitee to check there before resending the link out of band.

No behaviour change; no spec asserts the emailed-branch string. Targeted E2E over the settings/invite surface: 9 passed.

### #17 feat(ui): screens for two-factor auth and custom objects

Nhánh `claude/codebase-review-audit-9b75d4` → `main`; tạo 2026-08-28; merge 2026-08-29.

#### What & why

An audit of the codebase found several features with complete, tested backends
but **no user interface** — usable only through the API. This PR closes the two
most prominent: **two-factor authentication** and **custom objects**. It adds
the missing screens and wires them to the existing endpoints. **No backend
contract changes.**

#### Two-factor authentication

- **Settings → Two-factor authentication:** enrolment shows a scannable QR
  (rendered by a new dependency-free encoder, `src/lib/qr.ts`) alongside the
  manual key, confirms with the first code, and shows ten one-time backup codes
  exactly once. Turning it off requires the account password.
- **Login** now reveals a code field when an account has 2FA enabled, accepting
  a TOTP **or** a backup code — previously `requires2fa` surfaced only as a raw
  error string with nowhere to type the code.

#### Custom objects

- **Settings → Custom objects:** define objects and their fields; each object
  joins the sidebar with a generic records page at `/objects/{apiName}` for
  create / edit / delete, reusing the shared field inputs. The sidebar refreshes
  on change without a reload.

#### Verification

- `npm run build` — clean.
- `npm test` — **711 passed / 0 failed** on real Postgres (adds 31 QR tests; the
  encoder is checked **bit-for-bit** against the `python-qrcode` reference across
  versions 1/3/8 and all eight masks).
- `npx playwright test` — **47 passed** (42 existing, no regression; 5 new). The
  2FA specs read the secret from the enrolment dialog and compute a **genuine
  RFC 6238 code** to sign in; the custom-objects spec runs the full
  define → fields → records CRUD → cleanup flow and asserts a date field
  round-trips to the same calendar day.

#### Independent review

An adversarial review pass ran over the diff. Findings addressed in this PR:

- **Security (defense-in-depth):** custom-object URL values are linked only after
  re-checking the `http(s)` scheme at render, so a `javascript:` value left over
  from a field retyped to `url` (a path the field API allows without revalidating
  existing records) can never become a live link.
- **Correctness:** date fields store noon-local epoch, so the calendar day
  survives a negative UTC offset on round-trip.
- **UX:** two-factor error messages no longer leak outside their modal after it
  closes; the QR box degrades to the manual key instead of crashing on an
  over-long payload; the enrol button is guarded against double-submit.

#### Out of scope (flagged, not changed)

`PATCH /api/custom-objects/{id}/fields/{fieldId}` lets a field's `type` change
without revalidating existing records. The render-time scheme check above closes
the actual XSS vector from the UI; revalidating records in the backend would be
deeper defense-in-depth and is left as a separate decision since it changes API
behavior.

### #18 fix(custom-objects): revalidate records when a field definition changes

Nhánh `fix/custom-object-field-retype-revalidation` → `main`; tạo 2026-08-29; merge 2026-08-29.

#### What & why

Follow-up to #17. That PR added the custom-objects UI and closed the XSS vector
on the **read** side (the records page links a URL value only after re-checking
the `http(s)` scheme). The review flagged the matching **write**-side gap, left
out of scope then and picked up here.

Custom-object records are validated one at a time, on write. So changing a
field's **type**, its **select options**, or its **required** flag did not
revalidate records already stored — a field retyped from `text` to `url` left a
non-URL value (including a `javascript:` string) sitting in the record until its
next edit.

#### Change

`PATCH /api/custom-objects/{id}/fields/{fieldId}` now revalidates every existing
record against the prospective field definition and **refuses the change with
`409`** (naming the offending value) when any record would become invalid,
instead of mutating stored data silently. The caller fixes the offending records
first, then retries. Harmless changes — relabel, reorder — are unaffected.

This is an intentional, safe tightening of the API contract: the endpoint gains
a `409` response it did not return before.

#### Where

- `src/lib/custom-objects.ts` — new `firstInvalidRecord(objectId, defs)` helper
  (returns the first validation error among existing records under a prospective
  field set, or null).
- `src/app/api/custom-objects/[id]/fields/[fieldId]/route.ts` — the PATCH handler
  builds the next field set and calls the helper before applying.

#### Tests

`tests/custom-object-field-retype.test.ts` — real route handlers on real
Postgres + RLS:

- retype `text → url` **refused (409)** while a record holds a non-URL, and the
  field type is left unchanged;
- the same retype **allowed (200)** once the record is fixed to a valid URL;
- making a field **required refused (409)** while a record leaves it blank;
- a **relabel still allowed (200)** with records present.

#### Verification

- `npm run build` — clean.
- `npm test` — **715 passed / 0 failed** on real Postgres (adds 4).
- e2e unchanged (no e2e-covered flow retypes a field); the PR's CI runs it.

### #19 docs: add ops runbook, feature audit and platform research

Nhánh `docs/ops-reports-and-runbook` → `main`; tạo 2026-10-12; merge 2026-10-12.

Docs only — no code changes.

Adds working notes that until now lived only on one machine. They wait for this merge because the runbook holds infrastructure identifiers (droplet IP, Cloudflare account/zone/tunnel IDs), and the repository became private on 2026-10-13.

| File | What it is |
|---|---|
| `plans/reports/runbook-261013-0037-droplet-deploy-guide.md` | How production was built and deployed, the decisions for the replacement droplet, and the 13/10 tunnel outage |
| `plans/reports/code-review-260829-0125-codebase-feature-completeness.md` | Feature-completeness audit behind #17 and #18 |
| `plans/260829-0145-2fa-custom-objects-ui/plan.md` | Plan for the 2FA and custom-objects UI (#17) |
| `plans/reports/brainstorm-261012-*`, `research-261012-*` | Cloudflare stack and D1-for-Postgres evaluations |

Scanned for secrets before committing: no keys or tokens; the only pattern hits were GitHub permalink URLs.

### #20 ci: run on push only for main

Nhánh `ci/push-trigger-main-only` → `main`; tạo 2026-10-12; merge 2026-10-12.

Every push to a PR branch ran CI twice: once for `push` (any branch) and once for `pull_request`. PR #19 shows it — six checks for a docs-only change, three jobs times two triggers. With the repository now private, that doubles the Actions minutes billed against the GitHub Free allowance.

This keeps `push` for `main` only. Feature branches are still checked by their pull request, and merges to `main` still get their own run. `release.yml` is unaffected.

The PR is its own check: its branch push should start no run, and its pull request should start exactly one set of three jobs.

### #21 docs(crm): add domain glossary and PilotCo pipeline fit report

Nhánh `claude/pilot-sales-pipeline-bd7929` → `main`; tạo 2026-10-12; merge 2026-10-12.

Docs only — no code changes.

Records the outcome of fitting Fourty to PilotCo's 2026–2027 sales pipeline workbook (11 opportunities). Three rounds of decisions are settled; implementation is on hold until the owner gives the go-ahead.

| File | What it is |
|---|---|
| `CONTEXT.md` | New domain glossary for Fourty: Deal, Amount, Owner, Pipeline, Stage, Expected close date, Delivery date, Reporting currency, Exchange rate, Weighted forecast, Forecast period, Breakdown field |
| `plans/reports/advisor-261013-0151-PilotCo-sales-pipeline-fit.md` | Evidence (workbook figures, code checks with file:line), decision log Q1–Q21, and the agreed implementation outline (§12) |

Gaps in Fourty found while checking the code, to be fixed in later PRs:

- A deal's owner is always its creator; no surface (UI, REST, GraphQL, MCP) can set or change it (`src/lib/actions/deals/create.ts:55`, `src/lib/validators.ts:38`).
- The API accepts any 3-letter currency, and `convert()` passes unknown codes through unconverted, so 50,000,000 THB would count as 50,000,000 USD on the dashboard (`src/lib/validators.ts:41`, `src/lib/currency.ts:48`).
- Exchange rates are hardcoded; the `fx_rates` override described in `src/lib/currency.ts:4` is not implemented anywhere.
- The forecast is a single number with no time period; the expected close date is only used to flag overdue deals (`src/lib/services/stats.ts:32`, `:210`).

The report names PilotCo customers and opportunity values. The repository is private since 2026-10-13. A secret scan of the diff found no keys or tokens; the only pattern hit was a VND figure that looks like an IP address.

### #22 feat(deals): assign and hand over deal owners, refuse unconvertible currencies

Nhánh `feat/deal-owner-currency` → `main`; tạo 2026-10-13; merge 2026-10-13.

Phase 1 of `plans/261013-0909-PilotCo-sales-pipeline/plan.md`: the two changes PilotCo needs before its 11 opportunities can be imported.

**Deal owners.** Deals take `ownerId` on every write surface, the way tasks already do: omitted keeps the caller (an API key leaves it unassigned), `null` unassigns, anyone else must be an active member of this workspace. A handover writes an `owner_changed` entry to the timeline ("changed owner: A → B", translated), and a member who has since left keeps their name there. GraphQL `Deal` gains `ownerId` and `owner`; the deal form gets an Owner picker whose default on a new deal is "Me", so the old behaviour holds unless someone picks another member. Workflow tasks already follow the deal's owner, so they now follow the handover too.

**Currencies.** `currency` must be one of the 12 supported codes. An unknown code used to be stored and then summed unconverted, so 50,000,000 THB counted as 50,000,000 USD. MCP clients now see the allowed codes as an enum.

**Tenant scoping fix found on the way.** `workspace_members` has no row-level security, but the assignee helpers (`listAssignees`, `getAssignee`, the owner check) assumed it did. They listed, and accepted as owners, members of every workspace on the instance. They move to `src/lib/actions/assignees.ts` and now filter on `current_setting('app.workspace_id', true)`, the GUC the RLS policies use; unset means no rows. This also fixes task assignment. Other queries on that table are left for a separate audit.

| Area | Files |
|---|---|
| Owner and currency | `src/lib/validators.ts`, `src/lib/actions/deals/{create,update}.ts`, `src/lib/actions/assignees.ts` (moved from `tasks/shared.ts`) |
| Surfaces | `src/lib/graphql/schema.ts`, `src/mcp/tools.ts` (description), `src/app/(app)/deals/deal-form.tsx`, timeline in `src/components/record-panels.tsx` + `src/lib/activity-display.ts`, en/vi strings |
| Tests | new `tests/deals-assign.test.ts` (9), `tests/deal-currency.test.ts` (2); additions to `tests/activity-display.test.ts`, `tests/action-json-schema.test.ts`; regenerated `tests/fixtures/graphql-schema.graphql` (additive only: `Deal.ownerId`, `Deal.owner`) |
| Docs | `docs/guides/pipeline.md` (Deal owner, currency rule), `docs/api/rest.md`, `docs/api/graphql.md`; `CONTEXT.md` terms are already on main |

Known limit, accepted: one write yields one timeline entry. A stage move outranks an owner change, which outranks a field update; the audit log records every write.

How it was checked: tests written red first at the agreed seams; full suite 1,119 passed, `tsc` and `next build` clean, Playwright `deal-form` and `kanban` specs passed; the owner picker and timeline were driven in a browser against the built app (owner list shows only this workspace's members after the fix).

### #23 feat(reports): reporting currency per workspace and quarterly forecast tables

Nhánh `feat/reporting-currency-forecast` → `main`; tạo 2026-10-13; merge 2026-10-13.

Phase 4 of `plans/261013-0909-PilotCo-sales-pipeline/plan.md`: lets PilotCo read its 2026–2027 pipeline in VND, by quarter, split by sales motion.

**Reporting currency.** Each workspace picks a Reporting currency and may override any Exchange rate, written as units per 1 USD (`GET`/`PATCH /api/settings/reporting`; Settings → Reporting, admin only). Dashboard KPIs, charts, board column totals, the deal page and pipeline aging are expressed in it, and both stats payloads name it in `currency`. A workspace that never set it keeps USD at the built-in rates, so nothing changes for existing installs. This also implements the `fx_rates` override the comment in `src/lib/currency.ts` described but no code read.

**Forecast by quarter.** `GET /api/stats/reports` adds `forecast.byClose` and `forecast.byDelivery`: calendar quarters with a subtotal per year and an undated row. The delivery table reads a deal date field the admin picks; columns split by a single-choice field the admin picks. Open deals count at their stage probability, won deals in full at the date they were signed, lost deals not at all. A role that cannot read amounts gets neither table; one that cannot read custom fields gets no split and no delivery table. The pure grouping lives in `src/lib/forecast.ts`.

**Language-aware amounts.** Compact amounts follow the UI language: "293,9 tỷ ₫" in Vietnamese (Intl's own Vietnamese currency style abbreviates to "T"), "₫293.9B" in English. Board column headers no longer run the deal count into a longer total.

API notes: `currency` is new on both stats payloads; pipeline aging gains `amount` (reporting currency) and keeps `amountUsd` as USD for existing readers.

| Area | Files |
|---|---|
| Money | `src/lib/currency.ts`, `src/lib/reporting.ts`, `src/app/api/settings/reporting/route.ts`, `src/hooks/use-reporting.ts` |
| Forecast | `src/lib/forecast.ts`, `src/lib/services/stats.ts`, `src/app/(app)/reports/reports-client.tsx` |
| UI | dashboard, charts, deals board, deal detail, settings section, company and contact amount formatting, en/vi strings |
| Tests | new `tests/forecast.test.ts` (7), `tests/reporting-settings.test.ts` (4), `tests/reports-forecast.test.ts` (3); additions to `tests/currency.test.ts`, `tests/stats-policy.test.ts` |
| Docs | `docs/guides/analytics.md` (Forecast by quarter), `docs/guides/pipeline.md`, `docs/api/rest.md`, README, key features, tutorial |

Known limit, documented: quarters are read in UTC, so a deal marked won in the first hours of a quarter's first day east of UTC counts in the quarter before.

How it was checked: full suite 1,137 passed, `tsc` and `next build` clean, all 107 Playwright specs passed; the settings, dashboard, board and both forecast tables were driven in a browser against a local copy of the imported PilotCo pipeline, and the table figures matched a hand calculation.

### #24 docs(plans): record the live droplet deployment in the runbook

Nhánh `docs/runbook-droplet-live` → `main`; tạo 2026-10-13; merge 2026-10-13.

Docs only — no code changes.

Records the replacement droplet that has served `crm.example.com` since 2026-10-13, so the runbook matches what is actually running.

| File | Change |
|---|---|
| `plans/reports/runbook-261013-0037-droplet-deploy-guide.md` | Outage marked resolved; section 3 now lists the new droplet (IP, machine, deploy key, tunnel, mail, both backup layers). Steps 2, 4, 6c and 9b move from unverified to run, with what differed: the tunnel token endpoint returns a string, cloudflared is pinned to `2026.10.0`, and the backup pull uses a forced `tar` command because macOS ships openrsync, which `rrsync` rejects. Adds the sample-data reset recipe (run by the operator, since it deletes the database) and four traps: Cloudflare 1010 on Python's default User-Agent, python.org Python without root certificates, openrsync, the local approval hook. |
| `plans/261013-0909-PilotCo-sales-pipeline/plan.md` | Phases 0, 1, 2 and 4 done; phase 3 imported the configuration, 11 deals and 2 tasks wait for two invitees. |

The runbook carries infrastructure identifiers (droplet IP, Cloudflare account, zone and tunnel IDs), as the previous version did; the repository is private. A secret scan of the diff found no keys or tokens.

### #25 fix(auth): keep SSO with the instance owner and sign in to an active workspace

Nhánh `fix/workspace-members-scoping` → `main`; tạo 2026-10-13; merge 2026-10-13.

Follows the tenant-scoping gap found in #22 (the assignee helpers listed members of every workspace because `workspace_members` has no row-level security). This audits every other query on the tables that rely on explicit scoping — `workspace_members`, `workspaces`, `api_keys`, and reads of `users` — and fixes what it found. Full table of checked call sites: `plans/reports/audit-261013-1246-workspace-members-tenant-scoping.md`.

**No other cross-workspace read.** The members routes, invite acceptance, `roleInWorkspace`, API keys and workspace/user reads all scope explicitly.

**SSO connections (security).** Connections are instance-wide and the callback links an existing user by email, so an admin of *any* workspace could create a connection to an IdP they control and sign in as anyone on the instance, or set `defaultWorkspaceId`/`defaultRole` to provision themselves as admin of another workspace. ADR-014 recorded "any workspace admin can manage SSO for the whole instance" as a known limitation without this consequence. Now only admins of the instance owner's workspace (the first one created, at setup) may read or change connections: `src/lib/sso/authorize.ts`, used by all five handlers. Later workspaces get 403; the Settings panel already hides on 403. ADR-014 and `docs/self-hosting/operations.md` are amended. Single-workspace installs see no change.

**Password sign-in (correctness).** Login opened the session in the first membership row — unordered, and including workspaces the user had been removed from, where every request was then refused. `membershipsOf` now returns active memberships, earliest-joined first, as SSO sign-in already did.

Tests, written red first: `tests/sso.test.ts` (owner may manage; a later workspace's admin gets 403 on GET, POST, PATCH, DELETE) and `tests/login-workspace.test.ts` (skips a removed workspace; picks the earliest-joined). The static guard in `tests/api-auth.test.ts` accepts `authorizeSso(` as an `authorize()` call, since it calls `authorize()` first. Full suite 1,141 passed, `tsc` clean, all 107 Playwright specs passed.

### #26 fix(invites): say an invite was used instead of calling it expired

Nhánh `fix/invite-already-accepted` → `main`; tạo 2026-10-13; merge 2026-10-13.

An invite link works once. Opening it again after joining returned the same `400 Invite is invalid or expired` as a genuinely expired invite, so the page told people who were already members that their invite had expired. On crm.example.com (2026-10-13) both invitees who reported "expired" had in fact joined, each with a session created the same second.

- `POST /api/members/accept` answers `409 Invite already accepted` for a used token; unknown or past-date tokens keep the `400`.
- The accept page shows "This invite has already been used. If you joined with it, sign in to open the workspace." with a link to plain `/login` (not back to the spent invite). Wording stays neutral because whoever reopens a link may not be the person who used it.
- A used link still admits no one: no account, no session. The e2e replay step now asserts exactly that, plus the new message and link.

Tests: new `tests/invite-accept.test.ts` (used → 409, written red first; expired → still 400). Full suite 1,143 passed, `tsc` clean, all 107 Playwright specs passed.

### #27 feat(invites): show the sign-in email on the accept page

Nhánh `feat/accept-shows-login-email` → `main`; tạo 2026-10-13; merge 2026-10-13.

#### Why
An invitee on crm.example.com asked how to sign in after accepting: the accept form asks only for a name and a password, and nothing says the account's email is the one the invite went to.

#### What
- `src/lib/invites.ts`: `parseInviteToken` (moved from the accept route) and `inviteEmail(token)`, which returns the invite's email only while it is live (not accepted, not expired).
- `/accept` shows "Your sign-in email: {email}" (vi: "Email đăng nhập của bạn: {email}") to a visitor who is not signed in.
- A used, expired or malformed link shows no email.

#### Tests
- `tests/invite-accept.test.ts`: live invite returns its email; used, expired and malformed tokens return null.
- `e2e/invite-accept.spec.ts`: the guest sees the sign-in email; after the invite is used, the line is gone.
- Local: 1,150 unit tests and 107 e2e pass.

### #28 docs: user administration and CRM feature-gap research

Nhánh `docs/user-admin-and-feature-gaps` → `main`; tạo 2026-10-13; merge 2026-10-13.

#### What
- `plans/reports/research-261013-1649-user-administration.md`: what an admin can and cannot do about people today, with code evidence; 14 gaps, 5 concrete scenarios, decisions Q63-Q65.
- `plans/reports/research-261013-1649-crm-baseline-feature-gaps.md`: 22 baseline CRM capabilities (on the entry tier of at least 3 of Pipedrive, HubSpot, Salesforce, Twenty, Attio) checked against Fourty: 8 present, 8 partial, 6 missing; decisions Q66-Q68.
- `CONTEXT.md`: new Team terms: Workspace, Account, Member, Invite.
- `docs/guides/email-calendar.md`: messages are linked to contacts only, as `src/lib/sync/ingest.ts` does; the guide said contacts and deals.

No code changes.

### #29 fix(invites): a member cannot spend someone else's invite; rejoining lands in the workspace

Nhánh `fix/invite-accept-existing-member` → `main`; tạo 2026-10-13; merge 2026-10-13.

#### Why
Found in `plans/reports/research-261013-1649-user-administration.md` (notes a and b), decided as Q63 = A.

1. An admin who opens the invite link they just made for a new hire, in their own signed-in browser, and presses **Join workspace** was demoted to the invite's role, with no last-admin check, and the hire's link was spent. With one admin, the workspace was left with none.
2. A removed member who signs in again gets a session with no workspace. Accepting a new invite reactivated the membership but left the session pointing nowhere until they signed in a second time.

#### What
- `POST /api/members/accept`: a signed-in caller who is already an active member gets `409 "Already a member of this workspace"`; role and invite are untouched. A signed-in joiner's session moves to the joined workspace (`setSessionWorkspace` in `src/lib/auth.ts`).
- `/accept`: an active member sees "You're already in this workspace. This invite stays open for the person it was sent to." with an **Open workspace** link, instead of the Join button.
- i18n en and vi.

#### Tests
- `tests/invite-accept.test.ts`: two new tests, written first and red before the fix (200 instead of 409; session workspace null).
- `e2e/invite-accept.spec.ts`: the admin opens their own invite link and is told they are in, then the guest still redeems it; the second test now covers a removed member signing in from a new invite and working without a second sign-in. It used to invite the admin's own address, which is now refused by design.
- Local: 1,146 unit tests and 107 e2e pass.

### #30 feat(invites): admins see pending invites, resend and revoke them

Nhánh `feat/invites-pending-list` → `main`; tạo 2026-10-13; merge 2026-10-13.

#### Why
Phase 3 of `plans/261013-1808-team-and-crm-basics/plan.md` (decisions Q73, Q74, Q80, Q81). Two invites were waiting on crm.example.com and no screen showed them; a mistyped invite could not be taken back.

#### What
- Migration `0019_invite_revoked` adds `invites.revoked_at` (with its down file; reversibility test updated).
- `GET /api/members/invite`: invites not used and not revoked, newest first, with inviter name. Expired ones stay listed (marked) until resent or revoked (Q81).
- `DELETE /api/members/invite/:id`: revoke; audit `member.invite_revoked`. A revoked link is refused like an expired one on both the accept route and the accept page (`inviteState` in `src/lib/invites.ts`).
- `POST /api/members/invite`: inviting an address again revokes its pending invite, so one person has one working link; Resend in the UI is this call (Q73). Inviting someone already active in the workspace returns 409 (Q74).
- Team members card: "Pending invites" with Resend and Revoke; en and vi strings.
- `docs/api/rest.md`: invite endpoints.

#### Tests
- `tests/members.test.ts`: already-member refused; list and revoke; same address replaces; expired stays listed until replaced. Written first, red before the code.
- `tests/invite-accept.test.ts`: a revoked invite is refused like an expired one.
- `e2e/invite-accept.spec.ts`: admin sees the pending invite, resends it (new link, one row), revokes it; neither link lets anyone in.
- Local: 1,151 unit tests and 108 e2e pass.

#### Deploy
Runs migration 0019; the runbook deploy backs up first.

### #31 feat(owners): show owners, filter by them, and hand work over in bulk

Nhánh `feat/owner-visibility-handover` → `main`; tạo 2026-10-13; merge 2026-10-13.

#### Why
Phase 4 of `plans/261013-1808-team-and-crm-basics/plan.md` (Q65 group 1, Q70 item 3, Q82, Q83). When someone leaves, their deals and tasks could not be found or moved except one by one, and their tasks read as "Unassigned".

#### What
- **Owners shown**: deals kanban and list, tasks page, record task panels. A former member reads "Name (left)" (`src/lib/owner-display.ts`), from `GET /api/tasks/assignees?all=1`, which adds former members with `active`.
- **Filters**: `deals.list` takes `ownerId` (member or `none`), `closeQuarter` (`2026-Q4`, same UTC quarters as the forecast via `quarterOf`/`quarterRange`), `fieldKey` + `fieldValue` (one custom field choice). `tasks.list` takes `ownerId`. Saved views keep them. GraphQL query args added.
- **Bulk handover**: `deals.reassign` / `tasks.reassign` (`src/lib/actions/reassign.ts`) run each record's own update action, so every move gets the usual checks, `owner_changed` timeline line, audit and rescore; all or nothing on unknown ids or a non-member owner. REST `POST /api/{deals,tasks}/reassign`, GraphQL `reassignDeals`/`reassignTasks`, MCP `reassign_deals`/`reassign_tasks` (41 tools; docs and llms.txt updated).
- **UI**: deals list view has row checkboxes and a "Give to…" bar (Q83: list view only). Tasks: filter by owner, then give every task shown to someone else (rows already carry a completion checkbox).
- MCP JSON Schema: zod `regex` becomes `pattern`.

#### Tests
- `tests/owner-handover.test.ts` (10): owner/none/quarter/field filters, bad quarter → 400, former members listed with `?all=1`, bulk move with timeline lines, all-or-nothing on unknown id or stranger, viewer → 403, tasks bulk move. Written first, red before the code.
- `tests/owner-display.test.ts` (2), a `pattern` test in `tests/action-json-schema.test.ts`.
- GraphQL schema fixture regenerated: additive only. Surface parity and AI write-tool list updated for the new action.
- `e2e/owner-handover.spec.ts`: a member joins, gets 2 deals and 2 tasks, is removed; admin filters by "(left)", hands everything over.
- Local: 1,164 unit tests (on main with #30) and 108 e2e pass.

#### Deploy
No migration.

### #32 feat(deals): show old and new values on the timeline; ask for the lost reason

Nhánh `feat/value-history-lost-reason` → `main`; tạo 2026-10-13; merge 2026-10-13.

#### Why
Phase 5 of `plans/261013-1808-team-and-crm-basics/plan.md` (Q70 items 1 and 2, Q75, Q84, Q85). The timeline said "updated amount" without the numbers, so a change in the forecast could not be explained; and PilotCo's stage "Không tiếp tục" needs a reason that was only chased afterwards by a workflow task.

#### What
- **Value history**: `deals.update` records `meta.changes` for the Amount (both currencies), the Expected close date and the Delivery date (the date field chosen in reporting settings, by its label). Shown on the timeline as "Amount: ₫80B → ₫60B" (`formatValueChanges` in `src/lib/activity-display.ts`). A stage move or owner change in the same write keeps the changes on its line.
- **Lost reason**: `lostReasonField` (a deal select field) joins the reporting settings; set under Settings → Pipelines (`LostReasonSection`, admin). A move into a lost stage with that field empty → 400; with it in `custom`, fine; with no field named, unchanged. The kanban asks for the reason in a dialog and saves stage and reason together.
- e2e helper: `dropCard` (drop without waiting for a save); `dragCardToColumn` uses it.

#### Tests
- `tests/deal-history-lost-reason.test.ts` (6): amount and close date changes; delivery field by label; changes kept on a stage move; lost without a field; lost refused then accepted with the reason; non-select field refused. Written first, red before the code.
- `tests/activity-display.test.ts`: two tests for `formatValueChanges`.
- `tests/reporting-settings.test.ts`: defaults now include `lostReasonField: null`.
- `e2e/lost-reason.spec.ts`: drop on the lost stage → dialog, deal not moved until a reason is chosen; restores the setting after.
- Local: 1,172 unit tests (on main with #31) and 110 e2e pass.

#### Deploy
No migration. After deploy: Settings → Pipelines → choose "Lý do không tiếp tục"; turn off the workflow "Bổ sung lý do không tiếp tục".

### #33 feat(reports): split the quarterly forecast by owner

Nhánh `feat/forecast-by-owner` → `main`; tạo 2026-10-13; merge 2026-10-13.

#### Why
Phase 6 of `plans/261013-1808-team-and-crm-basics/plan.md` (Q70 item 4, Q86). Management wants each person's pipeline side by side in the quarterly forecast; the tables could only split by one custom field.

#### What
- `forecastByPeriod` computes both splits in one pass: `ownerColumns` (member ids, largest weighted total first, "" for unassigned last) and `byOwner` per row. The function stays pure and knows no names.
- Reports page: "Columns by: Breakdown field | Owner" above both forecast tables. Owner headings use `ownerLabel`, so someone who left keeps a column marked "(left)".
- Field policy: a role that cannot read `ownerId` gets no owner split, the same way `custom` hides the field split.

#### Tests
- `tests/forecast.test.ts`: owner columns (including one who left, unassigned last) and the split summing to the quarter's weighted total. Written first, red before the code.
- `tests/stats-policy.test.ts`: fixture shape updated.
- `e2e/forecast-owner.spec.ts`: switching to Owner shows the admin's column.
- Local: 1,174 unit tests (on main with #32) and 111 e2e pass.

#### Deploy
No migration.

### #34 feat(notes): the author or an admin can correct or delete a note

Nhánh `feat/edit-notes` → `main`; tạo 2026-10-13; merge 2026-10-13.

#### Why
Phase 7 of `plans/261013-1808-team-and-crm-basics/plan.md` (Q70 item 6, Q76, Q87). Notes were append-only: a typo ("800 tỷ" for "80 tỷ") stayed on the record and on its timeline for good.

#### What
- `notes.update` / `notes.delete` actions: REST `PATCH`/`DELETE /api/notes/:id`, GraphQL `updateNote`/`deleteNote`, MCP `update_note`/`delete_note` (delete is a dry run unless `confirm: true`, like the other delete tools; 43 MCP tools, docs and llms.txt updated).
- Only the author or an admin (`mayChange` in `src/lib/actions/notes/shared.ts`); a viewer never. `notes.list` returns `canChange` for the reader so the UI shows the buttons only when they work.
- Migration `0020_note_edited` adds `notes.edited_at` (down file included); an edited note reads "edited".
- Timeline: `note_added` lines now carry `noteId`; an edit updates the preview, a delete removes the line. Older lines are matched by their preview.
- Notes panel: Edit (inline) and Delete (confirm). The buttons are named "Edit note" / "Delete note", apart from the record's own Edit/Delete on the same page.

#### Tests
- `tests/notes-edit.test.ts` (5): author edits and the preview follows; admin may, another member may not; delete removes the line, author/admin only; `canChange` per reader; an older line without `noteId` is removed too. Written first, red before the code.
- GraphQL schema fixture regenerated (additive only); surface parity and AI write-tool list updated.
- `e2e/notes-edit.spec.ts`: add, correct, delete a note on a deal; the timeline previews follow.
- Local: 1,180 unit tests (on main with #33) and 112 e2e pass.

#### Deploy
Runs migration 0020; the runbook deploy backs up first.

### #35 feat(accounts): rename yourself, change your password, and rescue a member's account

Nhánh `feat/account-rescue` → `main`; tạo 2026-10-13; merge 2026-10-13.

#### Why
Phase 8 of `plans/261013-1808-team-and-crm-basics/plan.md` (Q65 groups 3 and 4, Q77, Q88). Beyond role and removal, everything about a person needed server access: a misspelled name, a forgotten password when mail is down, a lost 2FA phone.

#### What
- **My account** (account menu): `PATCH /api/me` renames you; `POST /api/me/password` changes your password with the current one, rate-limited like sign-in, signing out your other sessions and keeping this one.
- **Account rescue** (Settings → Team members → Account, per member): `PATCH /api/members/:id/email`, `POST /api/members/:id/reset-link` (one-time, 24 hours, from the same `issueResetToken` as forgot-password; the admin hands it over), `DELETE /api/members/:id/2fa`. Each is audited.
- **Who**: admins of the instance owner's workspace only (Q77), via `authorizeInstanceOwner` in `src/lib/instance-owner.ts`, which now also backs `authorizeSso`. These three also refuse an API key: a leaked key must not be enough to take over a person's account.
- `GET /api/members` adds `twoFactor` per member and `canRescue`.
- Stale "no forgot-password flow" comments corrected; ADR-014 and `docs/self-hosting/operations.md` describe the rule; REST docs list the routes.

#### Tests
- `tests/account-rescue.test.ts` (7): rename; password change needs the current one and signs out the other session only; 24-hour one-time reset link redeemed once; email change with a taken address refused; 2FA turned off; audit entries; refused for a later workspace's admin, a member, and an API key. Written first, red before the code.
- `tests/api-auth.test.ts`: static guard knows `authorizeInstanceOwner(`; `me`, `me/password` are self-service like 2FA.
- `e2e/account-rescue.spec.ts`: a member forgets their password, the admin makes a link, the member sets a new password, signs in, and renames themselves.
- Local: 1,187 unit tests (on main with #34) and 113 e2e pass.

#### Deploy
No migration.

### #36 feat(reminders): a morning email of each owner's due and overdue tasks

Nhánh `feat/morning-reminders` → `main`; tạo 2026-10-13; merge 2026-10-13.

#### Why
Phase 9 of `plans/261013-1808-team-and-crm-basics/plan.md` (Q70 item 5, Q78, Q89). A task only turned red on the dashboard when someone happened to open it; nothing reached its owner.

#### What
- **Pure** (`src/lib/reminders.ts`): `remindersFor` picks each owner's open tasks due today or overdue by the workspace's calendar day; `isReminderWindow` is 8:00 to noon local time; `localDay` reads the day in a time zone.
- **Dispatch** (`src/lib/services/reminders.ts`): nothing while off, without outbound mail, or outside the window. The first tick in the window claims the day for the workspace, then one email per owner, each with a per-person, per-day idempotency key. A worker down at 8:00 sends when it returns during the morning; never twice, never after noon.
- **Worker**: `reminders.dispatch` rides the existing minute tick and is self-managed like `agent.dispatch`, so ticks write no job receipts (the kill/restart test counts receipts and caught this).
- **Settings** (`/api/settings/reminders`, admin): on/off, time zone (default Asia/Ho_Chi_Minh), email language (the admin's language when first turned on). Saving records the app's address, since the worker has no request to build the link from. Settings card "Morning task reminder"; the switch updates at once and reverts if saving fails.
- Email in en and vi (`taskReminderEmail`); docs: records guide and REST reference.

#### Tests
- `tests/reminders.test.ts` (3) and `tests/reminders-dispatch.test.ts` (4): who gets what; the day across the UTC boundary; the window; settings admin-only with a valid zone; nothing before 8 or without mail; one email per owner per day across ticks; nothing while off. Written first, red before the code.
- `e2e/reminders.spec.ts`: an admin turns it on with a time zone; the setting sticks (restored after).
- Local: 1,194 unit tests (on main with #35) and 114 e2e pass.

#### Deploy
No migration. After deploy: Settings → Morning task reminder → on, Tiếng Việt.

### #37 feat: batch 2 — sessions, access by person, trash, deal contacts, product lines, send email

Nhánh `feat/crm-batch-2` → `main`; tạo 2026-10-13; merge 2026-10-14.

#### Why
Batch 2 of the team and CRM basics (`plans/261014-0401-crm-batch-2/plan.md`, decisions D1–D6): the six items left "for later" in batch 1. Leo gave full authority to decide, test, merge and deploy.

#### What
- **Sessions (D1)**: `users.last_login_at`; each session keeps its device, address and last seen time (written at most every 5 minutes). My account lists your signed-in devices and signs out one or all the others; the member list shows last sign-in; an admin of the instance owner's workspace signs a member out everywhere. Expired sessions are cleared at sign-in. Migration 0021.
- **Access by person (D2)**: API keys and mailboxes remember who made them; removing a member offers (ticked) to revoke their keys and disconnect their mailboxes. Migration 0022.
- **Trash (D3)**: deleting a contact, company, deal or task moves it with its notes, timeline and links to a `trash` table for 30 days; restore puts it back and re-links what is still free; admins purge. Settings → Trash. Migration 0023.
- **Deal contacts (D4)**: other people on a deal with a free-text role; the primary contact stays `contactId`. REST, GraphQL, MCP `set_deal_contacts`. Migration 0024.
- **Products and line items (D5)**: a product catalogue; a deal's lines make its Amount (through `deals.update`, so the value change is on the timeline and the health score follows), with prices converted to the deal's currency at the workspace's rates. A typed amount or currency is refused while lines set them. REST, GraphQL, MCP `list_products` and `set_deal_lines` (46 tools). Migration 0025.
- **Send email (D6)**: from a contact's or a deal's page, queued through the server's mail service (`mail.send`) under the member's name with Reply-To their address; written on the contact's (and deal's) timeline by name; audited; 30 per member per hour; 503 when mail is not set up. Sending from one's own Gmail/Microsoft mailbox is left for later.

#### Tests
- Unit and integration (real Postgres with RLS): 1,237 passed, 6 skipped.
- E2E (production build): 120 passed.
- Migration reversibility: up → down → up yields an identical schema through 0025.
- GraphQL schema fixture: additive only.

#### Review
Two-axis review (standards, spec D1–D6) before merge; fixes and kept decisions are listed at the end of the plan. Notably: a deal's lines are replaced under a row lock (a concurrent-save test fails without it), line ids survive saves, the worker empties expired Trash each minute, and email goes through the mail queue rather than a network call inside the request's transaction.

#### Deploy
Backup first (`backup.sh`), then pull and rebuild. Migrations 0021–0025 add tables and columns only.

### #38 docs(plan): batch 2 done; decisions Q90–Q93

Nhánh `docs/batch-2-decisions` → `main`; tạo 2026-10-14; merge 2026-10-14.

Records that batch 2 shipped (PR #37, deployed 14/10/2026) and Leo's answers to Q90–Q93. All four confirm what was built; no code changes.

### #39 feat: batch 3 wave 1 — owners, bulk changes, phone and note search, touchpoints, tags, task calendar

Nhánh `feat/crm-batch-3` → `main`; tạo 2026-10-14; merge 2026-10-14.

#### Why
Batch 3, wave 1 (`plans/261014-1300-crm-batch-3/plan.md`, D7–D12): the everyday gaps left after batches 1 and 2, from the CRM baseline research. Leo gave full authority to decide, test, merge and deploy.

#### What
- **Owner of contacts and companies (D7)**: changeable after creation (form, REST, GraphQL, MCP), lists filter by owner and show it, many at once with `reassign`; the timeline reads "changed owner: A → B".
- **Bulk changes (D8)**: tick rows on deals, contacts and companies to give them one owner or delete them into the Trash; deals also move stage together. On tasks, filter by owner and hand over, mark done or delete every task shown. Offered only to roles that may do it.
- **Search (D9)**: contacts by phone however it is written (0903… and +84 903… are one number); the palette also finds a contact, company or deal by the words of its notes. MCP/GraphQL search keeps exact-or-prefix.
- **Touchpoints (D10)**: a logged call, meeting or email says when it happened, how many minutes, and what was said; the timeline places it when it happened.
- **Tags (D11)**: a custom field that takes several choices on contacts, companies and deals; the deals list filters by one tag.
- **Task calendar (D12)**: the tasks page has a month view by due date.
- **All or nothing, by the transaction**: every action now runs in a savepoint, so a refusal anywhere inside an action (bulk changes, nested actions) undoes what it wrote even though the request's transaction commits to answer it.

#### Tests
- Unit and integration (real Postgres with RLS): 1,266 passed, 6 skipped.
- E2E (production build): 126 passed.
- No migration in this wave.

#### Review
Two-axis review (standards, spec D7–D12); fixes and kept decisions are at the end of the plan.

#### Deploy
Backup first (`backup.sh`), then pull and rebuild. No schema change.

### #40 feat(crm): batch 3 waves 2 and 3 — merge, deal import, templates, quotes, targets, audit filters, member reactivation, workflow events, synced email on deals

Nhánh `feat/crm-batch-3-wave2` → `main`; tạo 2026-10-14; merge 2026-10-14.

#### Why
Batch 3, waves 2 and 3 (`plans/261014-1300-crm-batch-3/plan.md`, D13–D21): the selling and admin gaps left after wave 1. Leo gave full authority to decide, test, merge and deploy.

#### What
**Wave 2 — selling**
- **Merge duplicates (D13)**: merge two contacts or two companies. The one that stays keeps its values, fills its blanks from the other, joins their tags; deals, tasks, notes, activities and AI conversations move over; the other goes to the Trash.
- **Import deals, export tasks and notes (D14)**: a CSV of deals is previewed row by row (stage, owner by email or name, company by name — created when new — contact by email, custom fields by label), then imported all or nothing. Tasks and notes export as CSV.
- **Email templates (D15)**: templates with blanks (`{{contact.firstName}}`, `{{deal.name}}`…) picked while composing; hidden fields stay blank.
- **Quotes (D16)**: a quote from a deal's line items, numbered BG-<year>-NNNN per workspace, with a printable page.
- **Targets (D17)**: admins set each member's quarter target on Reports; the owner table shows won, lost, open, weighted and attainment.

**Wave 3 — admin and integrations**
- **Audit log filters (D18)**: by person, kind of record, kind of action and days; the CSV names who acted and is safe to open in a spreadsheet.
- **Members (D19)**: reactivate a removed member; title and phone on each person.
- **Workflow events (D20)**: start on a deal's value change and on contact, company or deal deletion (including bulk deletes and a duplicate merged away, with `mergedInto`).
- **Synced email on deals (D21)**: a synced email also lands on the contact's open deals, placed at the time it was sent.

#### Migrations
0026 email_templates, 0027 quotes, 0028 targets (all with row-level security), 0029 users.title / users.phone. All reversible (tested).

#### Tests
- Unit and integration (real Postgres with RLS): 1,303 passed, 6 skipped.
- E2E (production build): 133 passed (the full run had one failure: `audit-log.spec.ts` still expected the CSV link without `limit=1000`; the expectation was updated and the audit specs re-run green).

#### Review
Two-axis review (standards, spec) per wave; fixes and kept decisions are at the end of the plan. One known limitation is kept and split out: events are queued before the request commits (ADR-017), so a rollback part-way through a bulk change can still send webhooks for undone writes.

#### Deploy
Backup first (`backup.sh`), then pull, rebuild and migrate.

### #41 docs(plan): batch 3 done and deployed

Nhánh `docs/batch-3-done` → `main`; tạo 2026-10-14; merge 2026-10-14.

Marks plans/261014-1300-crm-batch-3 done and records the deploy checks. Docs only; nothing to deploy.

### #42 fix(queue): a job waits for the write that asked for it to commit

Nhánh `fix/events-after-commit` → `main`; tạo 2026-10-14; merge 2026-10-14.

#### Why
Leo chose Q94 = A: close the gap ADR-017 left open. Workflow events, webhooks and emails were queued before the request's transaction committed, so a write taken back part-way (a bulk delete, a deal import refused on row 2) could still post `deal.created` / `deal.deleted` for records that never stayed.

#### What
- `src/db`: `deferUntilCommit(job)` holds a job until `withWorkspace()` commits, then runs it in a transaction of its own; `withSavepoint` drops the jobs asked for inside a savepoint that rolls back. Outside a transaction it returns false and the caller runs the job now.
- `src/lib/queue.ts`: `enqueue` uses it for every job. A job that fails after its write committed is logged, not thrown at a request that already has its answer.
- Invite emails follow the same rule: `emailed` now means "queued", as it already did with pg-boss.
- Tests that read a workflow's result inside the transaction that started it now read it after (engine, AI draft, webhook signature, invite).
- ADR-017 records the decision and its trade-off (a crash between commit and send loses those jobs; an outbox stays the route to crash-safe delivery).
- The plan records Leo's answers Q94–Q98.

#### Tests
- New: `tests/jobs-after-commit.test.ts` — held jobs run after commit and are dropped with their transaction or savepoint; a deal import refused on row 2 posts no webhook, a kept one posts exactly one (network stubbed).
- Unit and integration: 1,305 passed, 6 skipped.
- E2E (production build): 133 passed.

#### Deploy
No migration. Backup, pull, rebuild.

### #43 docs(plan): record Q99-Q101

Nhánh `docs/batch-3-q99-q101` → `main`; tạo 2026-10-14; merge 2026-10-14.

Records Leo's answers Q99-Q101 in the batch 3 plan. Docs only; nothing to deploy.

### #44 fix(import): a deals file dropped on the contacts import is caught

Nhánh `fix/import-mode-guess` → `main`; tạo 2026-10-14; merge 2026-10-14.

#### Why
On 14/10 at 18:05 a CSV of two deals was uploaded on Settings → Import while the page was on Contacts (its default). The contacts import skipped both rows ("0 created, 2 skipped") under a green "Import complete", so it looked done. Leo chose Q102 = A: catch it.

#### What
- `looksLikeDeals(headers)` in `src/lib/import-deals.ts`: no column a contact's name comes from (`firstname`, `first`, `name`, `fullname`, as `/api/import/contacts` reads them) and a deal name or value column (the deals import's own aliases, e.g. `Tên deal`, `Giá trị`, `Amount`).
- The contacts import asks before sending such a file: **Switch to Deals** previews the same file in the deals import; **Import as contacts anyway** goes ahead.
- The contacts file input has a label ("CSV file of contacts").
- Docs: `docs/guides/import-export.md`. Plan records Q102.

#### Tests
- Unit: `tests/import-kind.test.ts` (Vietnamese and English deals headers caught; contacts headers and unrelated files left alone). Full suite: 1,308 passed, 6 skipped.
- E2E: a Vietnamese deals file dropped on Contacts sends no contacts import and, after Switch to Deals, previews 1 row with no problem. Full suite: 134 passed.

#### Deploy
No migration. Backup, pull, rebuild.

### #45 feat(contacts): leads from another system create a contact or fill the known one

Nhánh `feat/lead-intake` → `main`; tạo 2026-10-15; merge 2026-10-15.

#### Why
PilotCo's own system will push leads into Fourty over the API (Q106 = C). Today a second lead with a known email is refused with 400, so every caller has to work around duplicates. Leo chose Q104 = A.

#### What
- `POST /api/contacts?ifExists=fill` → new action `contacts.createOrFill` (REST only):
  - email not seen before (or none): creates the contact through `contacts.create` (201, `{ contact, existed: false }`), with its usual timeline, audit, score and `contact.created` workflows;
  - email already known (case-insensitive): fills only the contact's empty fields through `contacts.update` (so permissions and field rules apply), keeps name, email and status, and writes a "came back as a lead from {source}" timeline entry and a `contact.returned` audit entry (200, `{ contact, existed: true }`). No second `contact.created`.
  - any other `ifExists` value is refused with 400.
- Plain `POST /api/contacts` is unchanged (a duplicate email is still refused).
- REST adapter: `status` may be a function of the result.
- Docs: new `docs/guides/lead-intake.md` (member key, owner ids from `/api/tasks/assignees`, follow-up workflow, answers, Cloudflare user-agent pitfall); REST table; guides index. Plan records Q103–Q106.

#### Tests
- `tests/lead-intake.test.ts` (7): new lead; known email fills blanks, keeps the rest and the customer status, notes the source; one follow-up task however often a lead returns; plain POST still refuses duplicates; owner given by `ownerId` owns the follow-up task; unknown `ifExists` refused; viewer refused.
- Unit and integration: 1,315 passed, 6 skipped. E2E (production build): 134 passed.

#### Deploy
No migration. Backup, pull, rebuild.

### #46 feat(leads): a default lead owner for contacts an API key makes

Nhánh `feat/default-lead-owner` → `main`; tạo 2026-10-15; merge 2026-10-15.

#### Why
Leads pushed by PilotCo's system over the API arrive unassigned when the request names no owner, so their follow-up task belongs to no one and no reminder goes out. Leo chose Q107 = B: a default lead owner.

#### What
- `src/lib/lead-settings.ts` + `GET/PATCH /api/settings/leads` (admins): `{ defaultOwnerId }`, which must be an active member; audited as `lead_settings.updated`.
- `contacts.create`: a contact made by an API key (no person behind the request) without `ownerId` goes to the default lead owner. A named `ownerId`, or `null` on purpose, wins. A default who has left the workspace gives an unassigned lead, never a refused one. Applies to `POST /api/contacts` and `?ifExists=fill`. People creating contacts in the app are unchanged (they own what they make).
- Settings card "Default lead owner" (admins).
- Docs: lead intake guide, REST table, CONTEXT.md term. Plan records Q107–Q108.

#### Tests
- `tests/lead-owner.test.ts` (5): unassigned while unset; admin-only and member-only choice; lead and its follow-up task go to the default (plain create too); named owner and `null` win; a departed default leaves the lead unassigned.
- `e2e/lead-owner.spec.ts`: an admin picks the default in Settings; it stays after reload.
- Unit and integration: 1,320 passed, 6 skipped. E2E (production build): 135 passed.

#### Deploy
No migration. Backup, pull, rebuild.

### #47 docs(plan): lead intake test, reminder check, Q109

Nhánh `docs/lead-intake-test` → `main`; tạo 2026-10-15; merge 2026-10-15.

Records the end-to-end lead intake test on production (Q108), this morning's reminder check (Q99) and Q109. Docs only; nothing to deploy.

### #48 fix(trash): a deleted record takes its open tasks with it

Nhánh `fix/trash-takes-open-tasks` → `main`; tạo 2026-10-15; merge 2026-10-15.

#### Why
Deleting the test lead on 15/10 would have left its task "Gọi lại lead Test" behind, due the next day, so its owner would have been reminded to call a lead that no longer exists. Leo chose Q113 = A.

#### What
- `trashRecord`: a contact, company or deal moves its tasks not yet done into the Trash payload and off the task list; done tasks stay as history.
- `restoreTrash`: open tasks come back with their owner and due date.
- Bulk deletes go through `trashRecord`, so they follow. Merging repoints tasks to the record that stays before the duplicate is trashed, so nothing changes there.
- Docs: records guide (Trash) and CONTEXT.md. Plan records Q110–Q113.

#### Tests
- `tests/trash.test.ts`: deleting a contact with one open and one done task leaves only the done one listed; restoring brings the open one back with its due date.
- Unit and integration: 1,321 passed, 6 skipped. E2E (production build): 135 passed.

#### Deploy
No migration. Backup, pull, rebuild. Records already in the Trash have no `openTasks` in their payload and restore as before.

### #49 docs(reports): PilotCo API curl guide

Nhánh `docs/pilot-api-curl` → `main`; tạo 2026-10-15; merge 2026-10-15.

Curl guide for PilotCo's lead-sending system (Q112): leads, contacts, companies, deals, deal people, stages, won/lost, tasks, notes, calls, search. Every command was run against a local Fourty set up like production (pipeline, stages, required fields, lost reason, default lead owner, follow-up workflow). Docs only; nothing to deploy.

### #50 feat(leads): the default lead owner also receives companies, deals and tasks a key makes

Nhánh `feat/default-owner-all-records` → `main`; tạo 2026-10-15; merge 2026-10-15.

#### Why
While rehearsing the PilotCo curl guide, a company, deal or task created by an API key without `ownerId` came out owned by no one; only contacts went to the default lead owner. Leo chose Q114 = A.

#### What
- `resolveOwner`: when no owner is named and there is no person behind the request (an API key), use the Default lead owner while they are an active member, else no one. This covers contacts, companies, deals and tasks (and anything else that resolves its owner there). A named `ownerId` or `null` still wins; people creating records in the app still own what they make.
- The special case in `contacts.create` is gone; `lead-settings` only reads and writes the setting, and the route checks the owner is a member (no import cycle).
- Settings hint, CONTEXT.md, REST table and lead intake guide say "contact, company, deal or task".
- `plans/reports/guide-261015-1150-PilotCo-api-curl.md` rewritten for developers only (Leo's request): data model, calling conventions, lookups, endpoints, errors. All 15 command blocks re-run against a local copy of the production setup.

#### Tests
- `tests/lead-owner.test.ts`: company, deal and task made by a key without an owner go to the default; named owner and `null` win.
- Unit and integration: 1,322 passed, 6 skipped. E2E (production build): 135 passed.

#### Deploy
No migration. Backup, pull, rebuild.

### #51 chore: keep the pilot customer's data out of the product repo

Nhánh `chore/remove-client-data` → `main`; tạo 2026-10-22; merge 2026-10-22.

#### Why
The product repository held the pilot customer's business data: customers and deal values, staff names and emails, the production hostname and droplet address, and production ids. Leo chose Q116 = A (move it to the customer's knowledge repository) and Q117 = A (stand-in names in tests and the UI example).

#### What
- Removed, now kept in the customer's knowledge repository: the sales pipeline plan, the pipeline advisory report, the droplet runbook, the API curl guide.
- Sanitized in place: the batch-3 plan (customer-operational decisions dropped, product decisions kept), the two research reports, and four plans/reports that only named the customer.
- Tests and the deal import CSV example use stand-ins (e.g. Fiesta Resort, Vạn Cát, `@team.test`, `crm.example.com`); first letters kept so name-sorted assertions keep their order (one test needed `EcoPower`).
- New `tests/compose-secrets.test.ts`: every database URL in `docker-compose.yml` reads its password from the environment. (Checked by hash on production: both database passwords already differ from the repository defaults.)

Git history still contains the old files; rewriting it is a separate decision.

#### Tests
Unit and integration: 1,325 passed, 6 skipped. E2E (production build): 135 passed.
