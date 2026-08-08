import { withAuth, authorize, apiError, json } from "@/lib/api";
import { isRecordEntity, permissionObjectFor } from "@/lib/ai/record-context";
import { principals } from "@/lib/ai/principals";
import { listConversationsFor } from "@/lib/ai/store";

/**
 * GET /api/ai/conversations?entityType=&entityId= — this user's threads about
 * one record, newest first (Phase 4).
 *
 * **Not gated on an AI provider.** A transcript is persisted CRM history: it has
 * to be readable after the key is removed, or the panel's promise that an answer
 * survives an unavailable provider is only true while the provider is available.
 * Sending a *new* message is what needs a model, and that route still refuses.
 *
 * Owner-scoped in the store as well as RLS-scoped — the two are different
 * checks, and a workspace-mate passing RLS would still be reading somebody
 * else's conversation.
 */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    if (!isRecordEntity(entityType) || !entityId) {
      return apiError("Expected entityType (contact|company|deal) and entityId");
    }
    const denied = authorize(auth, permissionObjectFor(entityType), "read");
    if (denied) return denied;

    const rows = await listConversationsFor({ entityType, entityId }, principals(auth).ownerId);
    return json({
      conversations: rows.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })),
    });
  });
}
