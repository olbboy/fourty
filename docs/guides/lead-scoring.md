# Lead & deal scoring

*Two deterministic 0–100 scores — one for contacts, one for deals — computed by pure
functions you can read and tune. No LLM, no black box, no per-token cost.*

Twenty lists automated scoring as "coming soon." Fourty ships it as tested code.

## Lead scoring (contacts)

Every contact gets a live **0–100 lead score** recomputed as data changes. It blends:

- **Profile fit** — how complete and qualified the contact's profile is.
- **Engagement recency** — how recently they've been touched (activity on the timeline).
- **Commercial signals** — associated deals and their value.

Hot leads surface on the [dashboard](./analytics.md), and you can sort any contact
list by score:

```bash
curl -H "Authorization: Bearer frty_..." \
  "https://your-crm.example/api/contacts?sort=score"
```

**Tuning.** The model is a single pure function in `src/lib/scoring.ts`. Change the
weights, redeploy, and every contact rescores deterministically — no retraining, no
drift. Because it's pure, it's covered by unit tests.

## Deal health

Every deal gets a **0–100 health / win-likelihood score** (`src/lib/deal-scoring.ts`,
[ADR-016](../adr/016-ai-native-strategy.md)). It anchors on the deal's **stage win
probability**, then adjusts for:

- **Momentum** — volume of recent activity (a warm deal beats a cold one at the same stage).
- **Recency** — days since the last touch.
- **Stalling** — too long sitting in the current stage is a risk signal.
- **Overdue** — an expected close date in the past while still open.
- **Relationship** — whether the deal has a primary contact.

Terminal stages are certain: a **won** deal scores 100, a **lost** deal 0. The score
comes back on deals from both the [REST routes](../api/rest.md) and the
[MCP deal tools](../api/mcp.md), and maps to a label:

| Score | Label |
|---|---|
| ≥ 66 | `healthy` |
| 33–65 | `at_risk` |
| < 33 | `stalled` |

## Why deterministic?

A score you can't explain can't be trusted to route a rep's time. Pure functions are
auditable, testable, free to run, and never leak data to a third party — the same
principle behind Fourty's whole [AI-native strategy](../adr/016-ai-native-strategy.md).

## Related

- **[Analytics & reports →](./analytics.md)**
- **[Workflows →](./workflows.md)** — act on scores automatically.
