import { eq, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { evaluateConditions, renderTemplate } from "./evaluate";
import { checkWebhookUrl } from "@/lib/net";
import type { EventContext, WorkflowAction, WorkflowDef } from "./types";

function loadWorkflows(): WorkflowDef[] {
  const rows = db.select().from(tables.workflows).where(eq(tables.workflows.enabled, 1)).all();
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
 * Fire an event through all enabled workflows. Synchronous by design —
 * SQLite is embedded, actions are cheap, and a single process means no
 * queue infrastructure (one of Fourty's deployment advantages).
 * Webhooks are the exception: they run fire-and-forget.
 */
export function dispatchEvent(ctx: EventContext): void {
  let defs: WorkflowDef[];
  try {
    defs = loadWorkflows();
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
        log.push(runAction(action, ctx));
      }
    } catch (err) {
      status = "error";
      log.push(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
    const now = Date.now();
    db.insert(tables.workflowRuns)
      .values({
        id: newId(),
        workflowId: wf.id,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        status,
        log: JSON.stringify(log),
        createdAt: now,
      })
      .run();
    db.update(tables.workflows)
      .set({ runCount: sql`${tables.workflows.runCount} + 1`, lastRunAt: now })
      .where(eq(tables.workflows.id, wf.id))
      .run();
  }
}

function runAction(action: WorkflowAction, ctx: EventContext): string {
  const now = Date.now();
  switch (action.type) {
    case "create_task": {
      const title = renderTemplate(action.title, ctx.snapshot);
      db.insert(tables.tasks)
        .values({
          id: newId(),
          title,
          priority: action.priority ?? "medium",
          dueDate: action.dueInDays ? now + action.dueInDays * 86400000 : null,
          entityType: ctx.entityType === "task" ? null : ctx.entityType,
          entityId: ctx.entityType === "task" ? null : ctx.entityId,
          ownerId: (ctx.snapshot.ownerId as string) ?? null,
          createdAt: now,
        })
        .run();
      return `created task "${title}"`;
    }
    case "add_note": {
      if (ctx.entityType === "task") return "skipped note: tasks have no notes";
      const body = renderTemplate(action.body, ctx.snapshot);
      db.insert(tables.notes)
        .values({
          id: newId(),
          body,
          entityType: ctx.entityType,
          entityId: ctx.entityId,
          authorId: null,
          createdAt: now,
        })
        .run();
      logActivity({
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
      db.update(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ [action.field]: value, updatedAt: now } as any)
        .where(eq(table.id, ctx.entityId))
        .run();
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
      // Fire-and-forget, but SSRF-guarded: resolve + reject private targets
      // before the request leaves the process (see src/lib/net.ts).
      checkWebhookUrl(action.url)
        .then((check) => {
          if (!check.ok) return; // blocked — see limitation note in net.ts
          return fetch(action.url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: payload,
          });
        })
        .catch(() => {});
      return `webhook queued → ${action.url}`;
    }
    case "log": {
      return renderTemplate(action.message, ctx.snapshot);
    }
    default:
      return "unknown action";
  }
}
