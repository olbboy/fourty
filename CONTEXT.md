# Fourty

Fourty is a self-hosted CRM for one sales team per workspace: it tracks who the team sells to, what each sale is worth, and what happens next.

## Language

### Team

**Workspace**:
The space one sales team's records live in; every Deal, contact and company belongs to exactly one Workspace.
_Avoid_: Tenant, organization, account

**Account**:
One person known to a Fourty installation, identified by the email address they sign in with; it exists once, however many Workspaces it belongs to.
_Avoid_: User, login, profile

**Member**:
An Account's place in one Workspace, carrying a role (admin, member or viewer); removing a Member ends their access to that Workspace but keeps the Account and its history, and an admin can reactivate them with the role they had.
_Avoid_: User, teammate, seat

**Default lead owner**:
The Member who receives a contact that an API key makes without naming an owner; a request that names an owner, or none on purpose, is followed instead.
_Avoid_: Round robin, lead router

**Invite**:
A single-use link that lets whoever holds it join one Workspace as a Member with a set role; it lapses after seven days.
_Avoid_: Invitation code, join link

**Session**:
One device an Account is signed in on; signing out or changing the password ends it.
_Avoid_: Login, token

**Trash**:
Where a deleted contact, company, Deal or task waits for 30 days, with its notes, timeline and tasks not yet done, until it is restored or purged.
_Avoid_: Archive, recycle bin, soft delete

### Selling

**Deal**:
One sale the team is pursuing with one customer, tracked from first contact to won or lost.
_Avoid_: Opportunity, project, lead

**Amount**:
The money the seller expects to invoice for a Deal if it is won.
A market potential, a partner's sales target, or the customer's total project budget is not an Amount.
_Avoid_: Target value, deal size, potential

**Deal contact**:
A contact taking part in a Deal besides its primary contact, with the role they play in it, such as technical or purchasing.
_Avoid_: Participant, stakeholder

**Product**:
Something the team sells, listed once with a name, an optional code and a list price in one currency.
_Avoid_: SKU, item, catalogue entry

**Line item**:
One Product, or a typed-in item, on a Deal with a quantity and a unit price in the Deal's currency; a Deal with line items has their sum as its Amount.
_Avoid_: Order line, position

**Owner**:
The one workspace member accountable for a Deal, contact or company right now; ownership can be handed to another member.
_Avoid_: Creator, rep, assignee

**Touchpoint**:
An email, call or meeting with a contact, logged by hand or synced from a mailbox, with when it happened.
_Avoid_: Interaction, engagement, activity (the timeline also holds system events)

**Merge**:
Folding a duplicate contact or company into the one that stays: its Deals, tasks, notes and timeline move over, and the duplicate goes to the Trash.
_Avoid_: Dedupe, combine, link

**Quote**:
A priced offer made from a Deal's line items at one moment, with a number and a date it is valid until; it does not change when the Deal changes later.
_Avoid_: Proposal, estimate, invoice

**Email template**:
A reusable subject and body whose blanks are filled from the contact, Deal and sender when an email is written.
_Avoid_: Snippet, canned response

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

**Target**:
The Amount a Member is expected to win in one calendar quarter, in the Reporting currency.
_Avoid_: Quota, goal, objective

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
