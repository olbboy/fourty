import { withAuth, authorize, json, parseBody, requestOrigin } from "@/lib/api";
import { audit } from "@/lib/audit";
import { loadReminderSettings, reminderPatch, saveReminderSettings } from "@/lib/services/reminders";

/**
 * The morning task reminder (Q78): on or off, the workspace's time zone, and
 * the language of the email. Admin only, like the other workspace settings.
 * Saving also records where the app is reached, for the link in the email.
 */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "settings", "read");
    if (denied) return denied;
    return json(await loadReminderSettings());
  });
}

export async function PATCH(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "settings", "update");
    if (denied) return denied;
    const body = await parseBody(req, reminderPatch);
    if (!body.ok) return body.response;
    const saved = await saveReminderSettings(body.data, requestOrigin(req));
    await audit(auth.user?.id, "reminder_settings.updated", { objectType: "settings", meta: { keys: body.keys } });
    return json(saved);
  });
}
