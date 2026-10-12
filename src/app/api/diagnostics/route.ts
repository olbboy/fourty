import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { capabilities, workspaceIdentity, WORKSPACE_ABOUT_KEY, WORKSPACE_ABOUT_MAX } from "@/lib/capabilities";
import { isKeylessResearchEnabled, setKeylessResearch, KEYLESS_RESEARCH_KEY } from "@/lib/research/config";

/**
 * Settings → Diagnostics: what this workspace can reach, and the one line of
 * identity the AI assistant is grounded with.
 *
 * Admin-only (the "settings" object), and it renders booleans and labels only —
 * never a key, never a redacted key. Knowing *that* a provider is configured is
 * useful; knowing anything about the credential is not.
 */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "settings", "read");
    if (denied) return denied;
    return json({
      workspace: await workspaceIdentity(),
      capabilities: await capabilities(),
      aboutMax: WORKSPACE_ABOUT_MAX,
      keylessResearch: await isKeylessResearchEnabled(),
    });
  });
}

const patchSchema = z.object({
  // Trimmed to empty clears it. The cap is enforced here, not by convention in
  // the renderer: the prompt is a cost surface and this is its write path.
  about: z.string().trim().max(WORKSPACE_ABOUT_MAX).optional(),
  /** The keyless research kill switch (Phase 3). Independent of any AI setting. */
  keylessResearch: z.boolean().optional(),
});

/**
 * Set the "what we sell" line that opens the assistant's prompt, and/or the
 * keyless research switch. Both are workspace settings rows; both are admin-only.
 */
export async function PATCH(req: Request) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "settings", "update");
    if (denied) return denied;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;

    if (body.data.keylessResearch !== undefined) {
      await setKeylessResearch(body.data.keylessResearch);
      await audit(auth.user?.id, "settings.updated", {
        objectType: "settings",
        objectId: KEYLESS_RESEARCH_KEY,
        meta: { keylessResearch: body.data.keylessResearch },
      });
    }

    const about = body.data.about;
    if (about === undefined) {
      return json({
        workspace: await workspaceIdentity(),
        keylessResearch: await isKeylessResearchEnabled(),
      });
    }
    if (about) {
      await db
        .insert(tables.settings)
        .values({ key: WORKSPACE_ABOUT_KEY, value: about })
        .onConflictDoUpdate({
          target: [tables.settings.workspaceId, tables.settings.key],
          set: { value: about },
        });
    } else {
      await db.delete(tables.settings).where(eq(tables.settings.key, WORKSPACE_ABOUT_KEY));
    }
    await audit(auth.user?.id, "settings.updated", {
      objectType: "settings",
      objectId: WORKSPACE_ABOUT_KEY,
      meta: { set: about.length > 0 },
    });
    return json({
      workspace: await workspaceIdentity(),
      keylessResearch: await isKeylessResearchEnabled(),
    });
  });
}
