import { withAuth, json } from "@/lib/api";
import { fieldAccessForPolicy, loadFieldPolicy } from "@/lib/field-permissions";
import { can } from "@/lib/permissions";
import type { ListAllowed } from "@/lib/field-access";

const LIST_OBJECTS = ["contacts", "companies", "deals", "tasks"] as const;

/**
 * The caller's own field restrictions, and what their role may change on each
 * list (so a viewer is not offered bulk changes the server would refuse).
 * Management stays admin-only on `/`.
 */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const allowed = Object.fromEntries(
      LIST_OBJECTS.map((object) => [object, { update: can(auth.role, object, "update"), delete: can(auth.role, object, "delete") }]),
    ) as ListAllowed;
    return json({ ...fieldAccessForPolicy(await loadFieldPolicy(auth.role)), allowed });
  });
}
