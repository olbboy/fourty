import { withAuth, json, apiError } from "@/lib/api";
import { endSession } from "@/lib/my-sessions";

type Params = { params: Promise<{ id: string }> };

/** Sign out one of your devices (this one included: that is signing out). */
export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    if (!auth.user) return apiError("Sign in as a person to end your sessions", 403);
    const { id } = await params;
    if (!(await endSession(auth.user.id, id))) return apiError("Session not found", 404);
    return json({ ok: true });
  });
}
