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

Stage reordering uses **Move up** and **Move down** controls, so the saved order is
explicit and keyboard-accessible. Members can manage pipelines and stages alongside
admins; viewers can read them but cannot change them.

A pipeline cannot be deleted while it is the default, the only pipeline, or still
referenced by a deal. A stage with deals cannot be deleted, and the Settings editor
keeps Won/Lost stages and at least one open stage in each pipeline. These conflicts
are returned by the API instead of moving or deleting deals implicitly.

You can change an open stage's win probability; Fourty recalculates the stored
scores of deals in that stage immediately. The API keeps closed-state history
consistent by rejecting stage-type changes.

## The weighted forecast

The forecast is deterministic: each open deal contributes `amount × stage
probability`, summed across the pipeline. Won deals count in full; lost deals drop
out. Because it is a pure calculation, the number on the board and the number in
[analytics](./analytics.md) always agree.

## Multi-currency

Deals can be denominated in **12 currencies** (USD, EUR, GBP, JPY, VND, and more).
Every report and every pipeline total **auto-normalizes to USD** using the rates in
`src/lib/currency.ts`, so a mixed-currency pipeline still rolls up to one comparable
figure. The original currency stays on the deal for display. A code outside the 12
is refused with `400`, so an unconvertible amount never reaches a total.

## Deal owner

Every deal has one **owner**: the member accountable for it right now. A deal created
in the app starts with its creator as owner; one created with an API key starts
unassigned. Pick another member in the deal form, or send `ownerId` (a member id from
`/api/tasks/assignees`) on create or update; `null` unassigns. Any member can hand a
deal over.

The handover is written to the deal's timeline as **changed owner: A → B**. A member
who has since left keeps their name there. Tasks that [workflows](./workflows.md) create
for a deal go to its owner.

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

Pipeline and stage administration is available over REST as documented in
[REST API → Pipelines and stages](../api/rest.md#pipelines-and-stages). The same
member/viewer access boundary applies there.

## Related

- **[Analytics & reports →](./analytics.md)** — where the pipeline rolls up.
- **[Workflows →](./workflows.md)** — automate stage changes and wins.
