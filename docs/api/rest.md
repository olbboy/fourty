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
| Tasks | `/api/tasks`, `/api/tasks/{id}` |
| Notes | `/api/notes` |
| Activities (timeline) | `/api/activities` |
| Pipelines | `/api/pipelines` |
| Search | `/api/search?q=…` (contacts + companies + deals) |
| Dashboard stats | `/api/stats/dashboard` |
| Reports | `/api/stats/reports` |
| Custom fields | `/api/custom-fields` |
| Custom object definitions | `/api/custom-objects` (+ `/fields`) |
| Custom object records | `/api/objects/{apiName}`, `/api/objects/{apiName}/{id}` |
| Saved views | `/api/saved-views` |
| Export | `/api/export/{contacts,companies,deals}` |
| Import | `/api/import/contacts` |
| API keys | `/api/api-keys` |
| Audit log | `/api/audit` |
| Members | `/api/members` |
| Field permissions | `/api/field-permissions` |
| Workflows | `/api/workflows` |
| Webhooks | `/api/webhooks` |

All support the same JSON shapes the UI uses. Standard verbs: `GET` / `POST` /
`PATCH` / `DELETE`.

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
| `POST` | `/api/pipelines/:id/stages` | Add a stage to a pipeline. |
| `PATCH` | `/api/pipelines/:id/stages` | Reorder stages by submitting the complete ordered `stageIds` list. |
| `PATCH` | `/api/pipelines/:id/stages/:stageId` | Update a stage's name, type, color, or win probability. |
| `DELETE` | `/api/pipelines/:id/stages/:stageId` | Delete a stage when it is not the last stage or referenced by a deal. |

A workspace can have one default pipeline: setting a new default clears the
previous one, while clearing the current default is rejected. A stage reorder
must include every stage exactly once; terminal stage types keep their canonical
win probabilities. Changing a stage type is rejected while deals reference that
stage. Changing an open stage's probability recalculates the stored score of its
deals in the same transaction.

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
