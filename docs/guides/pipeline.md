# Pipeline & deals

*A drag-and-drop Kanban that always shows what your pipeline is worth — weighted by
probability and normalized to one currency.*

## Stages and the board

On first boot Fourty creates a default **7-stage pipeline**. Each stage carries a
**win probability** (0–100%), which drives the weighted forecast and the
[deal health score](./lead-scoring.md#deal-health).

- **Kanban view** — drag a deal between stages; per-column totals and the weighted
  forecast update **optimistically** (instantly, then confirmed by the server).
  Moving a deal fires `deal.stage_changed` and, into a won/lost stage, `deal.won` /
  `deal.lost` — which [workflows](./workflows.md) can react to.
- **List view** — the same deals as a sortable table when you want density over drag.

Rename, reorder, recolour, add extra **open** stages, and set each stage's **win
probability** from **Settings → Pipelines**. The kanban dots use that colour. New
stages land before Won/Lost so the board keeps closed columns at the end (pick a
colour when adding, or keep the warm-neutral default). Type (open/won/lost) is
not editable, so won/lost workflows keep their meaning. Open stages with no deals can be deleted; Won/Lost
cannot, and a pipeline keeps at least one open stage. Those weights drive the
forecast and deal health. **Add pipeline** from the same Settings panel creates
another 7-stage board; rename it there, or delete it once no deals remain. A
workspace keeps at least one pipeline. The Deals page switches when more than
one exists. The default pipeline is created on first boot.

## The weighted forecast

The forecast is deterministic: each open deal contributes `amount × stage
probability`, summed across the pipeline. Won deals count in full; lost deals drop
out. Because it is a pure calculation, the number on the board and the number in
[analytics](./analytics.md) always agree.

## Multi-currency

Deals can be denominated in **12 currencies** (USD, EUR, GBP, JPY, VND, and more).
Every report and every pipeline total **auto-normalizes to USD** using the rates in
`src/lib/currency.ts`, so a mixed-currency pipeline still rolls up to one comparable
figure. The original currency stays on the deal for display.

## Over the API

Create and move deals over [REST](../api/rest.md) or [GraphQL](../api/graphql.md):

```bash
# Create a deal — lands in the first stage of the default pipeline
curl -X POST -H "Authorization: Bearer frty_..." -H "Content-Type: application/json" \
  -d '{"name":"Enterprise rollout","amount":320000,"currency":"EUR"}' \
  https://your-crm.example/api/deals

# Move it through the pipeline (fires deal.stage_changed / deal.won workflows)
curl -X PATCH -H "Authorization: Bearer frty_..." -H "Content-Type: application/json" \
  -d '{"stageId":"<stage-id>"}' https://your-crm.example/api/deals/<id>
```

Created and updated deals come back with a **health score** — see
[Lead & deal scoring](./lead-scoring.md#deal-health).

## Related

- **[Analytics & reports →](./analytics.md)** — where the pipeline rolls up.
- **[Workflows →](./workflows.md)** — automate stage changes and wins.
