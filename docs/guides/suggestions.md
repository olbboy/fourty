# Suggestions & the evidence ledger

*What a background pass believes about your records, why it believes it, and the
one narrow case where it may fill a blank field on its own.*

Fourty records **observations**, never confidences. A source reports what it saw —
"their signature on 14 July reads Head of Operations" — and a pure function prices
it. Nothing in the system can hand in a score of its own, because a model asked to
grade its own certainty answers confidently and in the flattering direction, and a
confidently wrong fact about a customer is worse than a blank field: nobody can tell
it is wrong.

The whole design is recorded in **[ADR-018](../adr/018-evidence-and-research.md)**.

## What you see

Under an empty field on a contact or company page, a suggestion shows:

- **the value** it proposes,
- **why** — the evidence, in the words the source used, with a link where there is one,
- **Accept** (writes it, as your edit) and **Dismiss** (retires that exact value for good).

Where a deterministic pass filled a blank field itself, the field carries a one-line
note saying what filled it and a **Revert** that puts back what was there before.

## What may be filled without asking

Almost nothing — and the constraints are enforced in the database transaction, not in
a prompt:

| Constraint | Meaning |
|---|---|
| **Empty field only** | A value you or an import typed is never replaced. A job change against a field you filled is *proposed*. |
| **VERIFIED band** | ≥0.85 combined score. |
| **A primary source** | Something that identifies *this person* — a reply from their own address, their signature, a thread reply, meeting attendance. Supporting evidence may combine to a proposal; it never fills a field alone. |
| **A deterministic source** | A pure parser. Anything a model touched caps at *probable* and stays a suggestion. |

A lone email signature scores 0.80 — a suggestion, not a write. It becomes a write only
when a second primary source agrees. That is deliberate, and raising the weight to make
a demo look better is exactly what the tests exist to catch.

Two sources that disagree do not average out. A **contradiction** holds the claim below
the suggestion floor entirely: the fact is unresolved, and you should see it that way.

## Employers are links, not text

There is no free-text employer field, and there never will be — it would drift from your
companies list within a quarter. An employer observation becomes a **company link** only
on an exact domain match against a company you already have. A name that merely looks
right, or a domain two of your companies share, stays a suggestion for a person to settle.

## Over the API

Every surface serves the same definitions ([ADR-017](../adr/017-action-registry.md)).

| | |
|---|---|
| **REST** | `GET /api/facts?entityType=contact&entityId=…&status=PROPOSED` · `POST /api/facts` · `PATCH /api/facts/{id}` with `{ "decision": "accept" \| "dismiss" \| "revert" }` |
| **GraphQL** | `factSuggestions(...)` · `recordFact(input:)` · `decideFact(id:, decision:)` |
| **MCP / AI** | `list_fact_suggestions` · `record_fact` · `decide_fact` |

Recording one:

```bash
curl -X POST https://your-crm.example/api/facts \
  -H "Authorization: Bearer $FOURTY_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "entityType": "contact", "entityId": "c_123", "field": "job_title",
    "value": "Head of Operations",
    "evidence": [{ "kind": "crm.signature-block", "detail": "their signature on 14 July reads Head of Operations" }]
  }'
```

The answer says what happened and why — `{ "result": { "ok": true, "applied": false,
"reason": "Scored PROBABLE — a proposal for a human, not a write." } }`. A claim below
the storage floor is refused with *find another independent source; do not raise the
score*, which is the only correct advice.

Fields a fact may address: `job_title`, `company_id`, `linkedin`, and
`cf:<customFieldId>` for a custom field.

## Governance

- Suggestions inherit **field permissions**: one about a field your role cannot read is
  not listed, and one you cannot write cannot be accepted.
- An applied fact audits as `via: "research"` with **no actor** — no background path
  invents a user. Your Accept, Dismiss and Revert audit as you.
- Applying **supersedes** rather than deletes, so "changed employer in March" is
  answerable from the ledger, with its date and its source.
- Weak claims (*possible*) are stored and never shown. You see *probable* and above.

## Related

- **[ADR-018 →](../adr/018-evidence-and-research.md)** — the scoring, the bands, the invariants.
- **[Email & calendar →](./email-calendar.md)** — where mailbox evidence comes from.
- **[AI assistant →](./ai-assistant.md)** — a separate surface: it proposes, you confirm.
