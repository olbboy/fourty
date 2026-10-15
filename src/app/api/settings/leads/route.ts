import { withAuth, authorize, apiError, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getAssignee } from "@/lib/actions/assignees";
import { leadSettingsPatch, loadLeadSettings, saveLeadSettings } from "@/lib/lead-settings";

/**
 * The Default lead owner (Q107, Q114): who receives a contact, company, deal or
 * task an API key makes without naming an owner. Admin only, like the other
 * workspace settings.
 */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "settings", "read");
    if (denied) return denied;
    return json(await loadLeadSettings());
  });
}

export async function PATCH(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "settings", "update");
    if (denied) return denied;
    const body = await parseBody(req, leadSettingsPatch);
    if (!body.ok) return body.response;
    const { defaultOwnerId } = body.data;
    if (defaultOwnerId && !(await getAssignee(defaultOwnerId))) return apiError("defaultOwnerId: not a workspace member");
    const saved = await saveLeadSettings(body.data);
    await audit(auth.user?.id, "lead_settings.updated", { objectType: "settings", meta: { defaultOwnerId: body.data.defaultOwnerId } });
    return json(saved);
  });
}
