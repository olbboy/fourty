# Tutorial: Set up a sales pipeline

*Build a pipeline, weight its stages, add a deal, and read the weighted forecast — in
about five minutes.*

**You'll need:** a running instance and an admin or member account.

## 1. Review the default pipeline

On first boot Fourty creates a **7-stage pipeline**. Open **Deals** to see the Kanban
board — one column per stage. You can use it as-is or reshape it in the next steps.

## 2. Rename and reorder stages

In **Settings → Pipelines**, rename stages to match how your team actually sells (e.g.
*Discovery → Demo → Proposal → Negotiation → Won/Lost*) and drag them into order.

## 3. Set a win probability per stage

Give each stage a **win probability** (0–100%). These drive the weighted forecast and
the [deal health score](../lead-scoring.md#deal-health), so make them realistic:

| Stage | Example probability |
|---|---|
| Discovery | 10% |
| Demo | 30% |
| Proposal | 50% |
| Negotiation | 75% |
| Won | 100% |

## 4. Add a deal

From the board, create a deal — name, amount, and currency:

```bash
curl -X POST -H "Authorization: Bearer frty_..." -H "Content-Type: application/json" \
  -d '{"name":"Acme rollout","amount":48000,"currency":"USD"}' \
  https://your-crm.example/api/deals
```

It lands in the first stage. Notice the response includes a **health score**.

## 5. Move it and watch the forecast

Drag the deal from *Discovery* to *Proposal*. The per-column totals and the
**weighted forecast** update instantly — each open deal contributes `amount × stage
probability`. Moving into a Won/Lost stage fires the `deal.won` / `deal.lost` events.

> [!TIP]
> Mixing currencies? Every total auto-normalizes to USD, so a EUR + GBP + USD pipeline
> still rolls up to one comparable number. See [Pipeline → Multi-currency](../pipeline.md#multi-currency).

## Done — what you built

A pipeline whose forecast reflects your real win rates, updating live as deals move.

## Next

- **[Automate a won deal →](./automate-a-won-deal.md)** — react to that `deal.won` event.
- **[Analytics →](../analytics.md)** — where the pipeline rolls up into reports.
