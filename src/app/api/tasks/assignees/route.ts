import { withAuth, authorize, json } from "@/lib/api";
import { listAssignees, listMembersForDisplay } from "@/lib/actions/assignees";

/**
 * Active workspace members a task can be assigned to. Readable by any role that
 * can read tasks. `?all=1` adds members who left, each with `active`, so lists
 * can still name the owner of their older work.
 */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "tasks", "read");
    if (denied) return denied;
    const all = new URL(req.url).searchParams.get("all") === "1";
    return json({ assignees: all ? await listMembersForDisplay() : await listAssignees() });
  });
}
