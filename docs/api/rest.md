# REST API

*Everything the UI does, over JSON. Standard verbs, predictable shapes, one bearer
token.*

Base path `/api`. JSON in and out. See the [API overview](./overview.md) for auth and
error shapes.

## Resources

| Resource | Endpoints |
|---|---|
| Contacts | `/api/contacts`, `/api/contacts/{id}` |
| Companies | `/api/companies`, `/api/companies/{id}` |
| Deals | `/api/deals` (filters `ownerId` = member id or `none`, `closeQuarter` = `2026-Q4`, `fieldKey` + `fieldValue`), `/api/deals/{id}` (`ownerId` assigns a member; `currency` must be one of the [12 supported codes](../guides/pipeline.md#multi-currency)), `POST /api/deals/reassign` (`{ ids, ownerId }`, all or nothing); `/api/deals/{id}/contacts` (GET the people on a deal, primary first; PUT `{ contacts: [{ contactId, role }] }` replaces the others); `/api/deals/{id}/lines` (GET the line items and their `total`; PUT `{ lines: [{ productId?, name?, quantity, unitPrice? }] }` replaces them and makes the deal's `amount` their sum; while a deal has lines, a PATCH that changes `amount` or `currency` is refused with `400`) |
| Products | `/api/products` (GET by name, `q`, `state=all` adds products no longer sold; POST `{ name, code?, unitPrice, currency }`), `/api/products/{id}` (PATCH, including `active`; DELETE). A deal line keeps the name and price it was added with |
| Tasks | `/api/tasks` (filter `ownerId` = member id or `none`), `/api/tasks/{id}` (`ownerId` assigns a member), `POST /api/tasks/reassign` (`{ ids, ownerId }`); `/api/tasks/assignees` lists who can own a task or deal (GraphQL `assignees`, MCP `list_assignees`), `?all=1` adds members who left, each with `active` |
| Notes | `/api/notes` (GET list + POST create), `/api/notes/{id}` (PATCH `{ body }`, DELETE; author or admin only) |
| Activities (timeline) | `/api/activities` |
| Email | `POST /api/email` `{ entityType: "contact" \| "deal", entityId, contactId, subject, body }`: a signed-in member (not an API key) writes to the contact, or to someone on the deal; sent under the member's name with replies to their address, written on the timeline. `503` when this server has no mail set up, `429` after 30 in an hour |
| Trash | `/api/trash` (what was deleted in the last 30 days), `POST /api/trash/{id}/restore` (needs create on that kind of record; `409` when a contact's email was taken meanwhile), `DELETE /api/trash/{id}` (admins, for good). Deleting a contact, company, deal or task moves it here with its notes and timeline |
| Pipelines | `/api/pipelines` (GET, POST), `/api/pipelines/{id}` (PATCH name; DELETE when empty and not the last) |
| Stages | `/api/stages` (POST name, winProbability, color), `/api/stages/{id}` (PATCH name, winProbability, order, color; DELETE open stages with no deals) |
| Search | `/api/search?q=…` (contacts + companies + deals + custom-object records) |
| Dashboard stats | `/api/stats/dashboard` (amounts in the reporting `currency` it names) |
| Reports | `/api/stats/reports` (adds `forecast.byClose` / `forecast.byDelivery` quarter tables) |
| Reporting settings | `/api/settings/reporting` (GET for any member; PATCH `currency`, `perUsd`, `deliveryField`, `breakdownField`, `lostReasonField` for admins) |
| Reminder settings | `/api/settings/reminders` (admins; GET, PATCH `enabled`, `timeZone`, `locale`) |
| Custom fields | `/api/custom-fields` |
| Custom object definitions | `/api/custom-objects` (+ `/fields`) |
| Custom object records | `/api/objects/{apiName}` (`q`, `sort`, `limit`), `/api/objects/{apiName}/{id}` |
| Suggestions (evidence ledger) | `/api/facts`, `/api/facts/{id}` |
| Background agent queue (read-only) | `/api/agent-tasks?entityType=&entityId=` |
| Saved views | `/api/saved-views` |
| Export | `/api/export/{contacts,companies,deals}` |
| Import | `/api/import/contacts` |
| API keys | `/api/api-keys` |
| Audit log | `/api/audit` |
| Members | `/api/members` (with `twoFactor`, `lastLoginAt` and `access: { keys, mailboxes }` per member, and `canRescue`), `/api/members/{userId}` (role, remove; `DELETE ?revokeAccess=1` also revokes the API keys they made and disconnects the mailboxes they connected); `DELETE /api/members/{userId}/sessions` signs a member out everywhere (signed-in admin of the instance owner's workspace); account rescue for admins of the instance owner's workspace, signed in (not an API key): `PATCH /api/members/{userId}/email`, `POST /api/members/{userId}/reset-link` (24-hour one-time link), `DELETE /api/members/{userId}/2fa` |
| My account | `PATCH /api/me` (`{ name }`), `POST /api/me/password` (`{ currentPassword, newPassword }`; signs out other sessions), `GET /api/me/sessions` (your signed-in devices, `current` marks this one), `DELETE /api/me/sessions` (sign out all the others), `DELETE /api/me/sessions/{id}` |
| Invites (admin) | `GET` pending / `POST` `/api/members/invite`, `DELETE /api/members/invite/{id}` (revoke); inviting an address again replaces its pending invite; `/api/members/accept` |
| Field permissions | `/api/field-permissions` (admin), `/api/field-permissions/me` (own) |
| Workflows | `/api/workflows` |
| Webhooks | `/api/webhooks/secret` (HMAC signing secret) |

Core CRM objects use the same JSON shapes the UI uses. Standard verbs: `GET` /
`POST` / `PATCH` / `DELETE`. A note can be changed or deleted only by its author or an admin.

### Pipelines and stages

Pipeline reads are available to all workspace roles. Admins and members can also
create, update, and delete pipeline and stage records; viewers receive the normal
`403` response for these writes. Every request is scoped to the authenticated
workspace.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/pipelines` | List pipelines with their ordered stages. |
| `POST` | `/api/pipelines` | Create a pipeline with the default stage set. |
| `PATCH` | `/api/pipelines/:id` | Rename a pipeline or make it the default. |
| `DELETE` | `/api/pipelines/:id` | Delete a pipeline when it is not the default, last, or referenced by a deal. |
| `POST` | `/api/pipelines/:id/stages` | Add an open stage before the Won/Lost stages. |
| `PATCH` | `/api/pipelines/:id/stages` | Reorder stages by submitting the complete ordered `stageIds` list. |
| `PATCH` | `/api/pipelines/:id/stages/:stageId` | Update a stage's name, color, or win probability. |
| `DELETE` | `/api/pipelines/:id/stages/:stageId` | Delete an unreferenced open stage while another open stage remains. |

A workspace can have one default pipeline: setting a new default clears the
previous one, while clearing the current default is rejected. A stage reorder
must include every stage exactly once. Stage types are immutable, terminal stages
keep their canonical win probabilities, and Won/Lost cannot be deleted. Changing
an open stage's probability recalculates the stored score of its deals in the same
transaction.

## Examples

```bash
# List hot leads, highest score first
curl -H "Authorization: Bearer frty_..." \
  "https://your-crm.example/api/contacts?sort=score"

# Create a deal (lands in the first stage of the default pipeline)
curl -X POST -H "Authorization: Bearer frty_..." -H "Content-Type: application/json" \
  -d '{"name":"Enterprise rollout","amount":320000,"currency":"EUR"}' \
  https://your-crm.example/api/deals

# Move it through the pipeline (fires deal.stage_changed / deal.won workflows)
curl -X PATCH -H "Authorization: Bearer frty_..." -H "Content-Type: application/json" \
  -d '{"stageId":"<stage-id>"}' https://your-crm.example/api/deals/<id>

# Dashboard stats as JSON — pipe your CRM into anything
curl -H "Authorization: Bearer frty_..." \
  https://your-crm.example/api/stats/dashboard
```

## Validation & errors

Writes are validated with zod. A bad field returns `400 {"error": "field: message"}`;
RBAC denials return `403`; unknown/other-workspace records return `404` (RLS); `429` means
try again later and `503` that a service the call needs (mail) is not set up here. See the
[API overview](./overview.md#error-shapes).

## Related

- **[GraphQL API →](./graphql.md)** — when you want typed, field-precise queries.
- **[Webhooks →](./webhooks.md)** — get pushed to, instead of polling.
