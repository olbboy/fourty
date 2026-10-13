import { withAuth, authorize, json } from "@/lib/api";
import { listTrash } from "@/lib/trash";

/** What was deleted in the last 30 days, newest first. Every role may look. */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "trash", "read");
    if (denied) return denied;
    return json({ items: await listTrash() });
  });
}
