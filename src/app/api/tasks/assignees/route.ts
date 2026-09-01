import { withAuth, authorize, json } from "@/lib/api";
import { listAssignees } from "@/lib/actions/tasks/shared";

/** Active workspace members a task can be assigned to. Readable by any role that can read tasks. */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "tasks", "read");
    if (denied) return denied;
    return json({ assignees: await listAssignees() });
  });
}
