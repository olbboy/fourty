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

The parser is a dependency-free RFC-4180 implementation (`src/lib/csv.ts`), so quoted
fields, embedded commas, and newlines are handled correctly.

## Exporting CSV

Export from the UI, or pull directly:

```bash
curl -H "Authorization: Bearer frty_..." \
  https://your-crm.example/api/export/contacts   # or /companies, /deals
```

Exports use the same field set the UI shows and respect
[field-permissions](../adr/011-field-level-permissions.md) — a restricted role can't
export a column it can't see.

## Bulk-loading other systems

- **From an older SQLite Fourty** — see [Upgrading → From SQLite](../self-hosting/upgrading.md#from-sqlite).
- **From Twenty** — the `@fourty/twenty-migrate` CLI imports companies, people, and
  opportunities; see [Upgrading → From Twenty](../self-hosting/upgrading.md#from-twenty).

## Related

- **[Email & calendar →](./email-calendar.md)** — pull activity, not just records.
- **[REST API →](../api/rest.md)**
