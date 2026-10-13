import { withAuth, authorize, apiError, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { loadReportingSettings, reportingPatch, saveReportingSettings } from "@/lib/reporting";

/**
 * Reporting currency, Exchange rate overrides, Delivery date field and
 * Breakdown field. Every member reads them (the app formats totals with
 * them); only an admin changes them.
 */
export async function GET(req: Request) {
  return withAuth(req, async () => json(await loadReportingSettings()));
}

export async function PATCH(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "settings", "update");
    if (denied) return denied;
    const body = await parseBody(req, reportingPatch);
    if (!body.ok) return body.response;
    const saved = await saveReportingSettings(body.data);
    if (!saved.ok) return apiError(saved.error);
    await audit(auth.user?.id, "reporting_settings.updated", { objectType: "settings", meta: { keys: body.keys } });
    return json(saved.settings);
  });
}
