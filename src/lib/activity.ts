import { db, tables } from "@/db";
import { newId } from "./id";

export type ActivityInput = {
  type: string; // created | updated | stage_changed | note_added | task_completed | email | call | meeting | workflow
  entityType: string; // contact | company | deal
  entityId: string;
  actorId?: string | null;
  meta?: Record<string, unknown>;
};

export function logActivity(input: ActivityInput): void {
  db.insert(tables.activities)
    .values({
      id: newId(),
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId ?? null,
      meta: JSON.stringify(input.meta ?? {}),
      createdAt: Date.now(),
    })
    .run();
}
