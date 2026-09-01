# GraphQL API

*A single typed endpoint with introspection — fetch exactly the fields you need,
scoped by the same RLS + RBAC as REST.*

## Endpoint

```
POST /api/graphql
Content-Type: application/json
Authorization: Bearer frty_...

{ "query": "…", "variables": { … } }
```

**Introspection is enabled**, so any GraphQL client (GraphiQL, Apollo, `graphql-request`)
can discover the full schema. The API is built on the reference `graphql` package
([ADR-008](../adr/008-graphql-api.md)) — no extra framework.

## Queries

Typed queries for every object, plus custom-object records:

- `contacts`, `contact(id)` — `contacts(sort:, status:, companyId:)` matches REST/MCP;
  `Contact.company` / `Contact.deals` / `Contact.colleagues` nest like MCP `get_contact` neighbours;
  `Contact.tasks` / `Contact.notes` / `Contact.activities` are the lists REST already filtered by that contact;
  `Contact.facts` is the suggestion inbox REST already filtered by that contact
- `companies`, `company(id)` — `companies(industry:)` matches REST/MCP;
  `Company.contacts` / `Company.deals` nest like `Deal.company`;
  `Company.tasks` / `Company.notes` / `Company.activities` likewise;
  `Company.facts` likewise
- `deals`, `deal(id)` — `deals(stageId:, pipelineId:, companyId:, contactId:)` matches REST/MCP;
  `Deal.company` / `Deal.contact` nest like `Contact.company`; `Deal.stage` is the MCP stage clock (name, days in stage);
  `Deal.tasks` / `Deal.notes` / `Deal.activities` likewise
- `tasks`, `task(id)` — `tasks(entityType:, entityId:, state:)` matches REST/MCP;
  `Task.owner` nests the assignee (`id` + `name`); `Task.contact` / `Task.company` /
  `Task.deal` nest a CRM pin (MCP `get_task` neighbours); `Task.record` nests a
  custom-object pin; `assignees` lists who can be assigned
- `notes` — `notes(limit:, entityType:, entityId:)` matches REST/MCP;
  `Note.contact` / `Note.company` / `Note.deal` nest a CRM pin like `Task`;
  `Note.record` nests a custom-object pin
- `activities` — `activities(entityType:, entityId:, limit:)` is the record timeline REST already served; without both keys the list is empty;
  `Activity.contact` / `Activity.company` / `Activity.deal` nest a CRM pin the same way;
  `Activity.record` nests a custom-object pin
- `factSuggestions` — `factSuggestions(entityType:, entityId:, status:, limit:)`
  matches REST/MCP ([suggestions](../guides/suggestions.md));
  `RecordFact.contact` / `RecordFact.company` nest the subject (facts only attach
  to contacts and companies; `deal` / `record` stay null)
- `search(q:, limit:)` — prefix-only across contacts, companies, deals, and custom-object
  records (`records { object data }`), matching MCP `search` (the command-palette REST
  route is infix). Nested `company` / `contact` work like `contact(id)`.
  A miss sets `note` rather than pretending nothing exists. `Record.object` is the apiName.
- `dashboardStats` — the same KPIs, funnel, hot leads, and stale deals as REST
  `/api/stats/dashboard` and MCP `get_dashboard_stats` (field-permissions apply)
- `reportStats` — the same source conversion, win/loss, pipeline aging, and score
  bands as REST `/api/stats/reports` and MCP `get_report_stats` (field-permissions apply)
- `pipelines`, `pipeline(id)`, `stages(pipelineId:)` — the same rows as REST
  `GET /api/pipelines` (stages nested). Writes stay on REST. MCP: `list_pipelines`,
  `get_pipeline`. Deal moves still use `updateDeal(stageId)` / `update_deal`.
- `customObjects`
- `records(object)`, `record(object, id)` — `records(object, q:, sort:)` matches
  REST/MCP for [custom objects](../guides/custom-objects.md);
  `Record.tasks` / `Record.notes` / `Record.activities` are pins whose `entityType`
  is the object's apiName

## Mutations

- `createContact` / `updateContact` / `deleteContact`
- `createCompany` / `updateCompany` / `deleteCompany`
- `createDeal` / `updateDeal` / `deleteDeal` — same stage-change and won/lost
  side effects as REST (`deal.stage_changed`, `deal.won`, `deal.lost`)
- `createTask` / `updateTask` / `deleteTask` — `updateTask(completed: true)`
  fires `task.completed` and logs on the linked record, same as REST
- `createNote` — pins a note to a contact, company, deal, or custom-object
  record and logs `note_added` on that record, same as REST
- `logActivity` — logs an email, call, or meeting on a record's timeline,
  same as REST `POST /api/activities` (feeds a contact's lead score)
- `recordFact` / `decideFact` — same evidence ledger as REST and MCP: record an
  observation (no score, no confidence), accept / dismiss / revert a suggestion
- `createRecord` / `updateRecord` / `deleteRecord` — for custom objects

## Errors

Unlike REST, GraphQL keeps **HTTP 200** and returns problems in the response body:

```json
{ "errors": [{ "message": "...", "extensions": { "code": "..." } }] }
```

## Example

```bash
curl -X POST https://your-crm.example/api/graphql \
  -H "Authorization: Bearer frty_..." -H "Content-Type: application/json" \
  -d '{"query":"{ contacts(sort: \"score\") { id firstName score company { name } } }"}'
```

## REST or GraphQL?

Both are first-class and enforce identical governance. Use **REST** for simple CRUD and
scripts; use **GraphQL** when you want to fetch a precise field set in one round trip or
prefer a typed schema. See the [API overview](./overview.md#choosing-an-api).

## Related

- **[Custom fields & objects →](../guides/custom-objects.md)**
- **[Suggestions & evidence ledger →](../guides/suggestions.md)**
- **[REST API →](./rest.md)**
