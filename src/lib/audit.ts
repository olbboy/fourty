import { db, tables } from "@/db";
import { newId } from "./id";

/**
 * Append an immutable audit entry for the current workspace (Gate B3, ADR-005).
 * Must be called inside a withAuth/withWorkspace context: `workspace_id` defaults
 * to the active workspace GUC, and the row can never be updated or deleted
 * (0004_audit_rls: REVOKE + DO-INSTEAD-NOTHING rules).
 *
 * `actorId` is the acting user (null for API-key or system actions).
 */
export async function audit(
  actorId: string | null | undefined,
  action: string,
  opts: { objectType?: string; objectId?: string; meta?: Record<string, unknown> } = {},
): Promise<void> {
  await db.insert(tables.auditLog).values({
    id: newId(),
    actorId: actorId ?? null,
    action,
    objectType: opts.objectType ?? null,
    objectId: opts.objectId ?? null,
    meta: JSON.stringify(opts.meta ?? {}),
    createdAt: Date.now(),
  });
}
