import { withAuth, authorize, apiError, json } from "@/lib/api";
import { permissionObjectFor, resolveBindableEntity } from "@/lib/ai/record-context";
import { principals } from "@/lib/ai/principals";
import { getConversation, listMessages } from "@/lib/ai/store";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/ai/conversations/[id] — one thread's transcript (Phase 4).
 *
 * Owner-scoped: another principal's thread is 404, not 403. A workspace-mate
 * should not learn that a conversation exists, only that this one is not theirs.
 *
 * Like the list route, this is **not** gated on an AI provider — the transcript
 * is what has to survive the provider being unreachable. Each message carries its
 * `status`, so a write left `pending_confirmation` comes back as a live card and
 * one left `executing` by a killed worker can be recognised as a turn that ended
 * rather than one still running.
 */
export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const { id } = await params;
    const { ownerId } = principals(auth);
    const conv = await getConversation(id, ownerId);
    if (!conv) return apiError("Conversation not found", 404);
    // The same role check the list route makes. Ownership answers "is this
    // yours"; this answers "may you still read that kind of record" — a role
    // narrowed after the thread was written must narrow the thread with it.
    if (conv.entityType) {
      const bound = await resolveBindableEntity(conv.entityType);
      if (bound) {
        const denied = authorize(auth, permissionObjectFor(bound), "read");
        if (denied) return denied;
      }
    }
    return json({
      conversation: {
        id: conv.id,
        title: conv.title,
        entityType: conv.entityType,
        entityId: conv.entityId,
        updatedAt: conv.updatedAt,
      },
      messages: await listMessages(id, ownerId),
    });
  });
}
