import { eq, sql } from "drizzle-orm";
import { db, tables, currentStore } from "@/db";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { enqueue } from "@/lib/queue";
import { evaluateConditions, renderTemplate } from "./evaluate";
import type { EventContext, WorkflowAction, WorkflowDef } from "./types";

async function loadWorkflows(): Promise<WorkflowDef[]> {
  const rows = await db.select().from(tables.workflows).where(eq(tables.workflows.enabled, 1));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled === 1,
    trigger: JSON.parse(r.trigger),
    conditions: JSON.parse(r.conditions),
    actions: JSON.parse(r.actions),
  }));
}

/**
 * Fire an event through the workflow engine (Gate B4). Enqueues a
 * `workflow.dispatch` job so workflow evaluation + actions run off the request
 * path, durably, with retry. In `inline` mode (tests / single-process dev) the
 * job runs immediately in the caller's workspace context — same observable
 * behaviour as the old synchronous engine.
 */
export async function dispatchEvent(ctx: EventContext): Promise<void> {
  const workspaceId = currentStore().workspaceId;
  if (!workspaceId) {
    // No active workspace context (defensive — routes always have one): run now.
    await runWorkflowsForEvent(ctx);
    return;
  }
  await enqueue("workflow.dispatch", { ctx }, { workspaceId });
}

/**
 * Execute all enabled workflows matching `ctx.event`. Runs inside a
 * withWorkspace() transaction (the worker wraps it; inline mode inherits the
 * request's). Records a run + bumps counters per workflow.
 */
export async function runWorkflowsForEvent(ctx: EventContext): Promise<void> {
  let defs: WorkflowDef[];
  try {
    defs = await loadWorkflows();
  } catch {
    return;
  }
  for (const wf of defs) {
    if (wf.trigger?.event !== ctx.event) continue;
    const log: string[] = [];
    let status = "success";
    try {
      if (!evaluateConditions(wf.conditions ?? [], ctx.snapshot)) {
        continue; // conditions not met — not even logged as a run
      }
      for (const action of wf.actions ?? []) {
        log.push(await runAction(action, ctx));
      }
    } catch (err) {
      status = "error";
      log.push(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
    const now = Date.now();
    await db.insert(tables.workflowRuns).values({
      id: newId(),
      workflowId: wf.id,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      status,
      log: JSON.stringify(log),
      createdAt: now,
    });
    await db
      .update(tables.workflows)
      .set({ runCount: sql`${tables.workflows.runCount} + 1`, lastRunAt: now })
      .where(eq(tables.workflows.id, wf.id));
  }
}

async function runAction(action: WorkflowAction, ctx: EventContext): Promise<string> {
  const now = Date.now();
  switch (action.type) {
    case "create_task": {
      const title = renderTemplate(action.title, ctx.snapshot);
      await db.insert(tables.tasks).values({
        id: newId(),
        title,
        priority: action.priority ?? "medium",
        dueDate: action.dueInDays ? now + action.dueInDays * 86400000 : null,
        entityType: ctx.entityType === "task" ? null : ctx.entityType,
        entityId: ctx.entityType === "task" ? null : ctx.entityId,
        ownerId: (ctx.snapshot.ownerId as string) ?? null,
        createdAt: now,
      });
      return `created task "${title}"`;
    }
    case "add_note": {
      if (ctx.entityType === "task") return "skipped note: tasks have no notes";
      const body = renderTemplate(action.body, ctx.snapshot);
      await db.insert(tables.notes).values({
        id: newId(),
        body,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        authorId: null,
        createdAt: now,
      });
      await logActivity({
        type: "workflow",
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        meta: { detail: `Workflow added note` },
      });
      return "added note";
    }
    case "update_field": {
      const table =
        ctx.entityType === "contact"
          ? tables.contacts
          : ctx.entityType === "company"
            ? tables.companies
            : ctx.entityType === "deal"
              ? tables.deals
              : null;
      if (!table) return "skipped update_field: unsupported entity";
      const allowed: Record<string, string[]> = {
        contact: ["status", "source", "ownerId", "jobTitle", "city", "country"],
        company: ["industry", "size", "ownerId", "city", "country"],
        deal: ["ownerId", "currency"],
      };
      if (!allowed[ctx.entityType]?.includes(action.field)) {
        return `skipped update_field: field "${action.field}" not allowed`;
      }
      const value =
        typeof action.value === "string" ? renderTemplate(action.value, ctx.snapshot) : action.value;
      await db
        .update(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ [action.field]: value, updatedAt: now } as any)
        .where(eq(table.id, ctx.entityId));
      return `set ${action.field} = ${String(value)}`;
    }
    case "webhook": {
      const payload = JSON.stringify({
        event: ctx.event,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        data: ctx.snapshot,
        firedAt: new Date().toISOString(),
      });
      // Durable delivery: hand off to the queue. The worker resolves + SSRF-checks
      // the target, POSTs it, and retries with backoff (dead-letters when spent)
      // — no longer lost on failure, and off the request path.
      const workspaceId = currentStore().workspaceId;
      if (workspaceId) {
        await enqueue("webhook.deliver", { url: action.url, body: payload, event: ctx.event }, {
          workspaceId,
        });
      }
      return `webhook queued → ${action.url}`;
    }
    case "log": {
      return renderTemplate(action.message, ctx.snapshot);
    }
    default:
      return "unknown action";
  }
}
