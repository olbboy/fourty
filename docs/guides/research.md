# Keyless research

**Fourty fills in job titles and company links from your own mailbox — with no
API key, no data vendor and no AI model.**

Connect a mailbox and Fourty starts reading what your contacts already sent you.
A signature block updated the week someone was promoted is better evidence than
anything a vendor will sell you, and it is already sitting in your inbox.

Everything on this page runs on a fresh install with nothing configured. The
optional [AI assistant](./ai-assistant.md) is a separate feature and is not
involved.

## What it reads

| Source | What it is evidence of |
|---|---|
| The signature block on a message they sent | Their job title and their employer's website |
| A reply from them on a thread Fourty also holds the other side of | That this address is really this person |
| Their name on the attendee list of a meeting that has happened | The same |

Matching is by **email address, exactly**. A contact with no address is never
matched, and Fourty never matches on a name — four people called A. Marchetti
work at four different companies, and a confidently wrong fact on a customer
record is worse than a blank field.

## What it writes

Nothing directly. Every observation goes through the
[evidence ledger](./suggestions.md), which decides what happens:

- **A signature on its own** is *probable* — you get a suggestion under the field
  with the block quoted, and you accept or dismiss it.
- **A signature plus a second, independent source** (a reply on a held thread, a
  meeting) is *verified* — Fourty fills the field in, shows the source, and gives
  you one-click Revert.
- **A field a person typed** is never overwritten. A job change against it
  arrives as a suggestion, always.
- **Two sources that disagree** — a signature pointing at one company while the
  person writes from another — holds the claim entirely. It is stored, not shown,
  and nothing is written. Someone changing jobs looks exactly like a mistake, and
  Fourty will not guess which it is.

Only `job_title` and `company_id` are written. An employer becomes a company link
only on an **exact domain match** against a company you already have; anything
else stays a suggestion for you to settle.

## When it runs

A mailbox is pulled on a schedule (about every 15 minutes; set
`AGENT_MAIL_PULL_MINUTES`). When a sync brings in something new about a contact,
Fourty books a `contact.evidence` task for that contact — visible on the record's
**Background work** panel, with a plain-English reason and when it is due.

The pass is bounded: at most 50 messages and 20 meetings per contact per run, and
it is idempotent. Running it twice does not produce two suggestions.

**Historical mail is not re-fetched.** Research starts from the next sync, because
Fourty stores no message bodies and cannot go back through what it already
discarded.

## What is stored

Fourty does **not** store email bodies. It never has. A signature block sits at
the *end* of a body, so the extraction happens while the message is still in
memory during sync, and only the result is written:

- `signature_title`, `signature_employer`, `signature_phone`
- `signature_raw` — the block itself, capped at 500 characters, because it is what
  you read as the reason for a suggestion

Plus the 280-character `snippet` and the headers that were already stored for
linking. The body is gone by the time the sync finishes.

## Turning it off

**Settings → Diagnostics → "Read connected mailboxes for facts."** Off stops the
reading immediately, for the whole workspace. Facts already on your records stay
and can be reverted one at a time — turning the switch off is not a retraction of
decisions already made.

Over the API:

```bash
curl -X PATCH https://your-fourty/api/diagnostics \
  -H 'content-type: application/json' \
  -d '{"keylessResearch": false}'
```

Connecting a mailbox is the consent to process that mail inside your own tenant.
Nothing is sent anywhere: the pass is a parser, it makes no network calls, and
every read is scoped by row-level security to the workspace that owns the mailbox.

## Related

- **[Suggestions & the evidence ledger →](./suggestions.md)** — how a claim is scored and what the bands mean.
- **[Email & calendar →](./email-calendar.md)** — connecting the mailbox in the first place.
- **[ADR-018 →](../adr/018-evidence-and-research.md)** — the decision record.
- **[SECURITY.md →](../../SECURITY.md)** — the posture summary.
