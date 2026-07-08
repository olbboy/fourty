# @fourty/twenty-migrate

Migrate a [Twenty](https://twenty.com) CRM workspace into [Fourty](https://github.com/olbboy/fourty).
Pulls **companies**, **people**, and **opportunities** from Twenty's GraphQL API and
recreates them in Fourty over its REST API — remapping foreign keys so contacts land
in the right company and deals point at the right company/contact.

## Install

```bash
npm install -g @fourty/twenty-migrate
```

## Usage

```bash
fourty-twenty-migrate \
  --twenty-url https://twenty.example.com \
  --twenty-token "$TWENTY_TOKEN" \
  --fourty-url  http://localhost:3000 \
  --fourty-key  "$FOURTY_API_KEY"
```

Flags fall back to env vars: `TWENTY_URL`, `TWENTY_TOKEN`, `FOURTY_URL`
(default `http://localhost:3000`), `FOURTY_API_KEY`.

- `--dry-run` — transform and count everything, write nothing. Good for a first pass.

The command prints a JSON report to stdout:

```json
{ "companies": 42, "contacts": 318, "deals": 96, "skipped": { "contacts": 0, "deals": 1 }, "errors": [] }
```

## What maps to what

| Twenty | Fourty | Notes |
|---|---|---|
| Company `name`, `domainName`, `employees`, `address`, `annualRecurringRevenue` | Company `name`, `domain`, `size`, `city`/`country`, `annualRevenue` | ARR micros → units; employees → size bucket |
| Person `name`, `emails`, `phones`, `jobTitle`, `companyId`, `linkedinLink` | Contact `firstName`/`lastName`, `email`, `phone`, `jobTitle`, `companyId`*, `linkedin` | `companyId` remapped to the new Fourty id |
| Opportunity `name`, `amount`, `closeDate`, `companyId`, `pointOfContactId` | Deal `name`, `amount`, `currency`, `expectedCloseDate`, `companyId`*, `contactId`* | amount micros → units; ISO date → epoch ms; FKs remapped |

\* Foreign keys are remapped from Twenty ids to the ids Fourty assigns during the run.

## Design

`transform.ts` holds the pure record mappers; `migrate.ts` is the orchestration
(pull → transform → remap ids → push) and depends only on a `TwentySource` /
`FourtySink` interface, so the whole run is unit-tested with fixtures. The real
network clients live in `clients.ts`. See `tests/twenty-migrate.test.ts` in the
Fourty repo.

## License

MIT
