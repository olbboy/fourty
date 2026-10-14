import { withAuth, authorize, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { purgeTrash, trashItem } from "@/lib/trash";

type Params = { params: Promise<{ id: string }> };

/**
 * Remove a deleted record for good, before its 30 days are up. Admin only:
 * "settings" is the admin-only object that stands for the workspace itself.
 */
export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "settings", "delete");
    if (denied) return denied;
    const { id } = await params;
    const item = await trashItem(id);
    if (!item || !(await purgeTrash(id))) return apiError("Not in the trash", 404);
    await audit(auth.user?.id, `${item.entityType}.purged`, { objectType: item.entityType, objectId: item.entityId });
    return json({ ok: true });
  });
}
