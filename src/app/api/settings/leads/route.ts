import { withAuth, authorize, apiError, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { leadSettingsPatch, loadLeadSettings, saveLeadSettings } from "@/lib/lead-settings";

/**
 * The Default lead owner (Q107): who receives a contact an API key makes
 * without naming an owner. Admin only, like the other workspace settings.
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
    const saved = await saveLeadSettings(body.data);
    if (!saved.ok) return apiError(saved.error);
    await audit(auth.user?.id, "lead_settings.updated", { objectType: "settings", meta: { defaultOwnerId: body.data.defaultOwnerId } });
    return json(saved.settings);
  });
}
