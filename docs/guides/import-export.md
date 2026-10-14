# Import & export

*Get data in and out as CSV, with header matching that tolerates whatever your last
CRM exported.*

## Importing CSV

Import contacts from **Settings → Import**, or over the API at `/api/import/contacts`.
The importer is built to handle messy real-world files:

- **Fuzzy header matching** — `First Name`, `first_name`, and `firstname` all map to
  the same field. You don't have to pre-clean headers.
- **Dedupe by email** — an incoming row that matches an existing contact's email
  updates rather than duplicates.
- **Company auto-linking** — a `company` column links to an existing company by name,
  or creates one if it doesn't exist.
- **Custom fields** — a column whose header is a contact custom-field key (or its
  label) writes that field. Invalid values (a `javascript:` URL, a bad date) are
  skipped; the rest of the row still imports. A new row missing a required custom
  field is skipped, matching REST create.
- **A deals file dropped here is caught** — a file with no column a contact's name
  comes from, but with a deal's name or value, is not imported as contacts (every
  row would be skipped). The page says so and offers **Switch to Deals**, which
  previews the same file in the deals import.

The parser is a dependency-free RFC-4180 implementation (`src/lib/csv.ts`), so quoted
fields, embedded commas, and newlines are handled correctly.

### Importing deals

Switch **Settings → Import** to **Deals**, or POST the CSV to `/api/import/deals`.
Each row is one deal:

| Column (any of these headers) | Read as |
|---|---|
| Name, Deal, Tên deal | the deal's name (required) |
| Amount, Value, Giá trị | `20.000.000.000`, `5,000` and `1500.5` all read as people write them |
| Currency, Tiền tệ | VND, USD… (the workspace currency when blank) |
| Pipeline, Stage, Giai đoạn | by name; the default pipeline and its first stage when blank |
| Close date, Ngày dự kiến ký | `2026-12-15` or `15/12/2026` |
| Owner, Người phụ trách | a member by email or by name; blank means whoever imports |
| Company, Công ty | by name; a company that doesn't exist yet is created |
| Contact, Liên hệ | an existing contact by email |
| any deal custom field | by its label or key |

Names are compared without case or Vietnamese marks, so `Công ty A` and `Cong ty A`
are the same company.

**Preview first.** The page (or `?dryRun=1`) shows every row as it would be stored,
with what is wrong with each one, and writes nothing. **All or nothing.** While any
row is wrong nothing is imported; and if a row is refused part-way (say, your role
may not set a deal's amount), the rows before it and any companies it created are
taken back too.

## Exporting CSV

Export from the UI, or pull directly:

```bash
curl -H "Authorization: Bearer frty_..." \
  https://your-crm.example/api/export/contacts   # or /companies, /deals, /tasks, /notes
```

Tasks and notes name the record each belongs to (its kind and name) and, for tasks,
the owner; dates are calendar days in the workspace's time zone. The **Data import**
card in Settings has a button for each.

Exports require both `export/read` and read permission for the requested object.
Sessions and API keys are scoped to their current workspace. A permitted viewer
can export, but [field permissions](../adr/011-field-level-permissions.md) remove
hidden columns from both headers and rows. Each entity has an explicit built-in
column allowlist in the [export route](../../src/app/api/export/[entity]/route.ts).
Current custom fields are added by their stable key when the `custom` field is
readable.

### Companies export scopes

The Companies **Export** menu offers:

| Scope | Included records |
|---|---|
| **Selected** | Checked records on the current page. Changing page, query, or workspace clears the selection. |
| **Filtered results** | Every matching record, across all pages, using the current search, industry, and sort. |
| **All companies** | Every company in the current workspace, without the current filters. |

The API accepts the same scopes:

```text
GET /api/export/companies?scope=selected&ids=<id1>,<id2>
GET /api/export/companies?scope=filtered&q=Acme&industry=Software&sort=name_asc
GET /api/export/companies?scope=all
```

Selected export requires 1–500 unique IDs; repeated `id` parameters are also
accepted. IDs outside the workspace are excluded. If the role cannot read company
IDs, selected export returns `403`. Filtered export shares the
[Companies query rules](../../src/lib/company-query.ts) and ignores `offset` and
`limit`. Search uses readable fields only; explicitly filtering or sorting on a
hidden field returns `403`. All-scope exports ignore search and industry filters.

Omitting `scope` preserves the existing all-records behavior. Contacts and deals
support only `all`; other scopes return `400`. Validation, authorization, and
query failures return JSON errors rather than a CSV download. Exports are
unpaginated and currently assembled in memory, so large exports need sufficient
server memory.

### Spreadsheet handling

Downloads use UTF-8 with a BOM. The spreadsheet serializer prefixes an apostrophe
to strings beginning with formula-like characters, including after whitespace,
and escapes commas, quotes, and newlines. Negative numeric values remain numeric.
The raw `toCsv` serializer and import parser retain their existing behavior; see
the [CSV implementation](../../src/lib/csv.ts).

First import was checked in LibreOfficeDev 26.8.0.0.alpha0 with formula evaluation
enabled: the protected sample cells remained text and numeric `-12` remained a
number. This does not guarantee identical handling in every spreadsheet or after
saving and reopening a file; see [OWASP's CSV injection guidance](https://community.owasp.org/attacks/CSV_Injection).

## Bulk-loading other systems

- **From an older SQLite Fourty** — see [Upgrading → From SQLite](../self-hosting/upgrading.md#from-sqlite).
- **From Twenty** — the `@fourty/twenty-migrate` CLI imports companies, people, and
  opportunities; see [Upgrading → From Twenty](../self-hosting/upgrading.md#from-twenty).

## Related

- **[Email & calendar →](./email-calendar.md)** — pull activity, not just records.
- **[REST API →](../api/rest.md)**
