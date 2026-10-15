# Pushing leads from your own system

*Send each lead your website, app or back office collects straight into Fourty,
as a contact with status `lead`, without making duplicates.*

In Fourty a lead is a **contact** whose status is `lead`; it becomes a deal when
you open one for it. Your system sends one HTTP request per lead.

## 1. Make a key for it

In **Settings → API keys**, generate a key with the role **member** and a name
such as "Lead intake". A member key can do what a member can do to records
(create, change, and delete into the Trash), but cannot touch settings, members,
API keys, webhooks or the audit log, so a leaked key does less harm than an
admin one. Revoke it in the same place if it leaks.
The key is shown once: put it straight into your system's secret store.

## 2. Send each lead

```bash
curl -X POST "https://your-crm.example/api/contacts?ifExists=fill" \
  -H "Authorization: Bearer $FOURTY_API_KEY" \
  -H "content-type: application/json" \
  -d '{"firstName":"Khôi","lastName":"Đỗ","email":"khoi@example.com","phone":"0903123456","source":"website","ownerId":"<member id>"}'
```

Only `firstName` is required. Also accepted: `lastName`, `email`, `phone`,
`jobTitle`, `companyId`, `source` (where the lead came from, up to 60 characters),
`linkedin`, `city`, `country`, `ownerId`, `status` (`lead` when left out) and
`custom` (contact custom fields by key).

`ifExists=fill` decides what happens when a contact already has that email
(compared without case):

| Situation | Answer | What Fourty does |
|---|---|---|
| New email, or no email | `201`, `{ contact, existed: false }` | Creates the contact, exactly as a contact made by hand: timeline, audit, score, and workflows on `contact.created`. |
| Email already known | `200`, `{ contact, existed: true }` | Fills only the contact's **empty** fields from the lead; what the team already knows wins. Name, email and status stay as they are, so a customer who fills the form again stays a customer. The timeline says "came back as a lead from {source}". No `contact.created`. |

Without `ifExists`, a second contact with the same email is refused (`400`), as in
the app.

## 3. Give the lead to someone

A key is not a person, so who gets a lead sent without `ownerId`?

- **Default lead owner.** An admin picks one member in **Settings → Default lead
  owner**. Every contact, company, deal or task an API key makes without naming
  an owner goes to them, follow-up task included. If that member leaves, leads arrive unassigned
  rather than refused. Unset, leads arrive unassigned.
- **Name the owner.** To give a lead to a particular salesperson, send their
  member id as `ownerId`; it wins over the default. `"ownerId": null` keeps the
  lead unassigned on purpose. `GET /api/tasks/assignees` (readable with the
  member key) lists the active members as `{ id, name }`.

## 4. Follow up automatically

Add a workflow in **Workflows**: when `contact.created`, only if `status` is
`lead`, **create a task** "Call back {{firstName}}", due in 1 day. The task goes to
the contact's owner, whose morning reminder lists it. A lead that comes back does
not make a second task.

## Answers to expect

| Status | Meaning |
|---|---|
| `201` / `200` | Created / already known (see above). |
| `400` | The body is invalid (the message says which field), or `ifExists` is not `fill`. |
| `401` | Missing or revoked key. |
| `403` | The key's role may not create contacts (a viewer key). |
| `429` | Too many requests; wait for `Retry-After` seconds. The default limit is 300 writes a minute per key. |

## Pitfalls

- **Never call the API from a web page.** The key would be readable by anyone
  who opens the page, and the API does not answer other sites' browser requests
  (no CORS). Post the form to your own server, and call Fourty from there.
- **Behind Cloudflare, name your client.** Cloudflare's browser check can refuse
  some default clients with error 1010 (Python's `urllib` is one); send your own
  `User-Agent`, for example `User-Agent: acme-leads/1.0`.
- **Retry on network errors and 429 only.** A `400` will fail again with the same
  body.

## Related

- **[REST API →](../api/rest.md)**
- **[Workflows →](./workflows.md)**
- **[Records & timeline →](./records.md)**
