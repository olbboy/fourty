import { withAuth, json, apiError } from "@/lib/api";
import { currentSessionId } from "@/lib/auth";
import { endSessions, sessionsOf } from "@/lib/my-sessions";

/** Your sessions: the devices you are signed in on, this one marked. */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
    if (!auth.user) return apiError("Sign in as a person to see your sessions", 403);
    return json({ sessions: await sessionsOf(auth.user.id, await currentSessionId()) });
  });
}

/** Sign out every other device; this one stays signed in. */
export async function DELETE(req: Request) {
  return withAuth(req, async (auth) => {
    if (!auth.user) return apiError("Sign in as a person to end your sessions", 403);
    return json({ ended: await endSessions(auth.user.id, await currentSessionId()) });
  });
}
