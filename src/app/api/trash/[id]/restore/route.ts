import { withAuth, authorize, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { restoreTrash, trashItem, TRASH_OBJECT } from "@/lib/trash";

type Params = { params: Promise<{ id: string }> };

/** Put a deleted record back. Needs the right to create that kind of record. */
export async function POST(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const { id } = await params;
    const item = await trashItem(id);
    if (!item) return apiError("Not in the trash", 404);
    const denied = authorize(auth, TRASH_OBJECT[item.entityType], "create");
    if (denied) return denied;
    const restored = await restoreTrash(id);
    if (!restored.ok) return apiError(restored.error, restored.status);
    await audit(auth.user?.id, `${item.entityType}.restored`, { objectType: item.entityType, objectId: item.entityId });
    return json({ entityType: restored.entityType, entityId: restored.entityId });
  });
}
