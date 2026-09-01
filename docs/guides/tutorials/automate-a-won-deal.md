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

Open **Workflows** in the sidebar (not Settings) and click **New workflow**. Name it
something like *"Won → onboarding"*.

## 2. Set the trigger

Under **When…**, choose **Deal won**. The workflow now runs whenever a deal moves into a
won stage.

## 3. (Optional) Add a condition

Only onboard sizeable deals? Click **Condition**, set the field to **Amount**, the
operator to **≥**, and the value to `25000`. Leave conditions off to run on every win.

## 4. Add the actions

The first action defaults to **Create a task**. Set:

1. **Create a task** — title `Onboard {{name}}`, due in 3 days. The task is assigned to
   the deal owner automatically. `{{name}}` interpolates the deal's name.
2. Click **Action** (that adds a note row) and set the body to
   `🎉 Won {{name}} for {{amount}} {{currency}}. Kick off onboarding.`

Click **Create workflow**. New workflows start enabled.

## 5. Test it

Drag a deal into the **Won** stage (or `PATCH` its `stageId`). Within a moment the worker
picks up the job and you'll see:

- a new **task** on the deal (assigned to the deal owner when the deal has one), and
- a **note** on the deal's [activity timeline](../records.md#the-activity-timeline).

## 6. Verify in the run history

On the workflow row, click the **run count**. The history records which trigger fired,
whether the condition matched, and the outcome of each action — so automation stays
auditable.

## Done — what you built

A hands-off onboarding trigger that survives restarts and retries on failure, thanks to
the durable queue.

## Next

- **[Webhooks →](../../api/webhooks.md)** — push the win to Slack or n8n as well.
- **[Workflows reference →](../workflows.md)** — every trigger and action type.
