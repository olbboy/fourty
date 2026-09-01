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
| Deals | `/api/deals`, `/api/deals/{id}` |
| Tasks | `/api/tasks`, `/api/tasks/{id}` (`ownerId` assigns a member); `/api/tasks/assignees` (GraphQL `assignees`, MCP `list_assignees`) |
| Notes | `/api/notes` (GET list + POST create; append-only) |
| Activities (timeline) | `/api/activities` |
| Pipelines | `/api/pipelines` (GET, POST), `/api/pipelines/{id}` (PATCH name; DELETE when empty and not the last) |
| Stages | `/api/stages` (POST name, winProbability, color), `/api/stages/{id}` (PATCH name, winProbability, order, color; DELETE open stages with no deals) |
| Search | `/api/search?q=…` (contacts + companies + deals) |
| Dashboard stats | `/api/stats/dashboard` |
| Reports | `/api/stats/reports` |
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
| Members | `/api/members` |
| Field permissions | `/api/field-permissions` (admin), `/api/field-permissions/me` (own) |
| Workflows | `/api/workflows` |
| Webhooks | `/api/webhooks` |

Core CRM objects use the same JSON shapes the UI uses. Standard verbs: `GET` /
`POST` / `PATCH` / `DELETE`. Notes are append-only (`GET` / `POST`).

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
RBAC denials return `403`; unknown/other-workspace records return `404` (RLS). See the
[API overview](./overview.md#error-shapes).

## Related

- **[GraphQL API →](./graphql.md)** — when you want typed, field-precise queries.
- **[Webhooks →](./webhooks.md)** — get pushed to, instead of polling.
