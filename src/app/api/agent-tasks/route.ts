import { z } from "zod";
import { withAuth, authorize, json } from "@/lib/api";
import { dueTasks, lastDecision, openTasksFor } from "@/lib/agent-tasks/schedule";

/**
 * What the agent is going to do, and what it last did (Phase 2).
 *
 * The point of the ledger is that this question has an answer from a table
 * rather than a log. Scoped to one record with `entityType` + `entityId`;
 * without them it returns what is due across the workspace.
 *
 * Read-only. Booking work is not something a client asks for directly — it is a
 * consequence of connecting a mailbox, or of a pass deciding to come back.
 */
const querySchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  limit: z.coerce.number().optional(),
});

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "agent-tasks", "read");
    if (denied) return denied;

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return json({ tasks: [], last: null });
    const { entityType, entityId, limit } = parsed.data;

    if (entityType && entityId) {
      return json({
        tasks: await openTasksFor(entityType, entityId),
        last: await lastDecision(entityType, entityId),
      });
    }
    return json({ tasks: await dueTasks(limit ?? 50), last: null });
  });
}
