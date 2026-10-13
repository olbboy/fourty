# Analytics & reports

*A dashboard that answers real sales questions out of the box — forecasting,
conversion, velocity, and risk — with every number reproducible from your data.*

## The dashboard

The home dashboard summarizes pipeline health at a glance: total open pipeline, the
probability-weighted forecast, win rate, and the hottest [leads](./lead-scoring.md).
It's also available as JSON, so you can pipe your CRM into anything:

```bash
curl -H "Authorization: Bearer frty_..." \
  https://your-crm.example/api/stats/dashboard
```

## The report catalogue

| Report | Answers |
|---|---|
| **Open pipeline** | How much is in flight right now? |
| **Weighted forecast** | What will we likely close, by stage probability? |
| **90-day win rate** | What share of decided deals did we win? |
| **Average sales cycle** | How long from create to close? |
| **Revenue trend** | How is closed revenue moving over time? |
| **Funnel by stage** | Where do deals concentrate — and where do they drop? |
| **Win/loss by month** | How are outcomes trending? |
| **Lead-source conversion** | Which sources actually convert? |
| **Pipeline aging** | Which deals are getting stale? |
| **Stale-deal alerts** | Which open deals have gone quiet? |

Reports are served at `/api/stats/reports` and rendered with
[Recharts](../architecture.md) in the UI.

## Forecast by quarter

The Reports page carries two tables of the pipeline by calendar quarter, with a
subtotal for each year and a row for deals that have no date yet:

- **By expected close date** — when each deal is expected to be signed; a won deal
  sits at the date it was actually signed.
- **By delivery date** — when the goods or service are expected to be handed over,
  read from the deal date field an admin picks in **Settings → Reporting**. Until one
  is picked, only the first table shows.

Open deals count at their stage probability, won deals in full, lost deals not at all.
If an admin also picks a single-choice field to **split forecasts by** (a deal's sales
motion, say), each choice gets a column of weighted values; the last columns give the
weighted total, the unweighted total and the number of deals. Quarters follow UTC, so
a deal marked won in the first hours of a quarter's first day east of UTC can count in
the quarter before. A role that cannot read deal amounts does not get either table.

## Currency handling

Every monetary figure is converted into the workspace's **reporting currency** before
it's aggregated, so a pipeline of EUR, GBP, and VND deals still rolls up to one
comparable number; the payloads name it in `currency`. See
[Pipeline → Multi-currency](./pipeline.md#multi-currency).

## Consistency guarantee

The dashboard, the reports, and the number on the [Kanban board](./pipeline.md) are
computed from the same deterministic aggregation service (`src/lib/services/`). They
cannot disagree — there is no separate analytics pipeline to drift out of sync.

## Related

- **[Lead & deal scoring →](./lead-scoring.md)**
- **[REST API → stats →](../api/rest.md)**
