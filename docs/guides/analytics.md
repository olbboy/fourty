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

## Currency handling

Every monetary figure is **auto-normalized to USD** before it's aggregated, so a
pipeline of EUR, GBP, and VND deals still rolls up to one comparable number. See
[Pipeline → Multi-currency](./pipeline.md#multi-currency).

## Consistency guarantee

The dashboard, the reports, and the number on the [Kanban board](./pipeline.md) are
computed from the same deterministic aggregation service (`src/lib/services/`). They
cannot disagree — there is no separate analytics pipeline to drift out of sync.

## Related

- **[Lead & deal scoring →](./lead-scoring.md)**
- **[REST API → stats →](../api/rest.md)**
