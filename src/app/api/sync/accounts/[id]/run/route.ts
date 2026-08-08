import { withAuth, authorize, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { pullAccount } from "@/lib/sync/pull";

type Params = { params: Promise<{ id: string }> };

/**
 * "Sync now" for one account (Gate C6). The pull itself lives in
 * `src/lib/sync/pull.ts` because the scheduled `mailbox.pull` task runs the same
 * code — this route is the impatient path to work that now happens anyway.
 */
export async function POST(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "sync", "update");
    if (denied) return denied;
    const { id } = await params;

    const result = await pullAccount(id);
    if (!result.ok) return apiError(result.reason, result.status);

    const counts = result.emails !== undefined ? { emails: result.emails } : { calendar: result.calendar };
    await audit(auth.user?.id, "sync_account.ran", {
      objectType: "sync_account",
      objectId: id,
      meta: counts,
    });
    return json(counts);
  });
}
