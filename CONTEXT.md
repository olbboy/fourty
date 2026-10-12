# Fourty

Fourty is a self-hosted CRM for one sales team per workspace: it tracks who the team sells to, what each sale is worth, and what happens next.

## Language

### Selling

**Deal**:
One sale the team is pursuing with one customer, tracked from first contact to won or lost.
_Avoid_: Opportunity, project, lead

**Amount**:
The money the seller expects to invoice for a Deal if it is won.
A market potential, a partner's sales target, or the customer's total project budget is not an Amount.
_Avoid_: Target value, deal size, potential

**Owner**:
The one workspace member accountable for a Deal right now; ownership can be handed to another member.
_Avoid_: Creator, rep, assignee

**Pipeline**:
The ordered sequence of Stages a Deal moves through; a Deal belongs to one Pipeline for its whole life.
_Avoid_: Board, funnel

**Stage**:
One step of a Pipeline, carrying a win probability and a kind: open, won, or lost.
_Avoid_: Status, column, phase

**Expected close date**:
The day a Deal is expected to be signed, that is, to reach a won Stage.
_Avoid_: Due date, deadline

**Delivery date**:
The day the goods or service of a Deal are expected to be handed over; the date revenue is planned against.
_Avoid_: Ship date, invoice date

### Reporting

**Reporting currency**:
The single currency a workspace shows its totals and forecasts in, chosen per workspace.
_Avoid_: Base currency, USD total

**Exchange rate**:
The rate an admin sets for converting one currency into the Reporting currency; it changes only when an admin changes it.
_Avoid_: FX rate, live rate, market rate

**Weighted forecast**:
The sum, over open Deals, of each Amount times its Stage's win probability, expressed in the Reporting currency.
_Avoid_: Expected revenue, projection

**Forecast period**:
A calendar quarter or calendar year into which Deals are grouped, by either their Expected close date or their Delivery date.
_Avoid_: Fiscal period, bucket

**Breakdown field**:
The one single-choice custom field on Deals that an admin picks to split forecasts into columns, one per choice.
_Avoid_: Segment (customers already use it for market segments), group-by, category
