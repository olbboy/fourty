# Tutorial: Automate a won deal

*When a deal is won, automatically create an onboarding task and drop a note on the
record — no manual busywork.*

**You'll need:** a running instance, a worker process, and a [pipeline](./set-up-a-sales-pipeline.md)
with a Won stage.

> [!IMPORTANT]
> Workflow actions run on the durable queue, so a **worker** must be running
> (`npm run worker`; Compose does this for you). Without one, the workflow fires but its
> actions never execute. See [Workflows → The durable queue](../workflows.md#the-durable-queue).

## 1. Create a workflow

Open **Settings → Workflows → New**. Give it a name like *"Won → onboarding"*.

## 2. Set the trigger

Choose the trigger **`deal.won`**. The workflow now runs whenever a deal moves into a
won stage.

## 3. (Optional) Add a condition

Only onboard sizeable deals? Add a condition such as **amount ≥ 25000**. Leave it off to
run on every win.

## 4. Add the actions

Add two actions:

1. **Create task** — title `Onboard {{name}}`, due in 3 days, assigned to the deal owner.
   The `{{name}}` template variable interpolates the deal's name.
2. **Add note** — body `🎉 Won on {{closedAt}} for {{amount}} {{currency}}. Kick off onboarding.`

Save and enable the workflow.

## 5. Test it

Drag a deal into the **Won** stage (or `PATCH` its `stageId`). Within a moment the worker
picks up the job and you'll see:

- a new **task** on the deal owner, and
- a **note** on the deal's [activity timeline](../records.md#the-activity-timeline).

## 6. Verify in the run history

Open the workflow's **run history**: it records which trigger fired, whether the
condition matched, and the outcome of each action — so automation stays auditable.

## Done — what you built

A hands-off onboarding trigger that survives restarts and retries on failure, thanks to
the durable queue.

## Next

- **[Webhooks →](../../api/webhooks.md)** — push the win to Slack or n8n as well.
- **[Workflows reference →](../workflows.md)** — every trigger and action type.
