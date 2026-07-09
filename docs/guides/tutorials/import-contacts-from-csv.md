# Tutorial: Import contacts from a CSV

*Bring a messy export from another CRM into Fourty — deduped by email and linked to
companies — without pre-cleaning the file.*

**You'll need:** a running instance and a CSV of contacts.

## 1. Know what the importer tolerates

You don't have to normalize headers or de-dup by hand. The importer handles:

- **Fuzzy headers** — `First Name`, `first_name`, and `firstname` all map to the same field.
- **Dedupe by email** — a row matching an existing contact's email **updates** it instead
  of creating a duplicate.
- **Company auto-linking** — a `company` column links to an existing company by name, or
  creates one.

## 2. Prepare the file (lightly)

A minimal CSV works:

```csv
First Name,Last Name,Email,Company
Ada,Lovelace,ada@example.com,Analytical Engines
Alan,Turing,alan@example.com,Bletchley Ltd
```

Quoted fields, embedded commas, and newlines are parsed correctly (RFC-4180).

## 3. Import

From **Settings → Import**, upload the file — or over the API:

```bash
curl -X POST -H "Authorization: Bearer frty_..." \
  -F "file=@contacts.csv" \
  https://your-crm.example/api/import/contacts
```

## 4. Verify

Open **Contacts**. You should see the imported people, each linked to a company (created
if it didn't exist). Re-running the same file **updates** rather than duplicates — safe to
retry.

> [!TIP]
> Need to get data back out? `GET /api/export/contacts` (or `/companies`, `/deals`)
> respects field-permissions — a restricted role can't export a column it can't see.

## Done — what you built

A clean, deduped contact list with company relationships, from a raw export.

## Next

- **[Lead scoring →](../lead-scoring.md)** — imported contacts get scored automatically.
- **[Import & export reference →](../import-export.md)**
