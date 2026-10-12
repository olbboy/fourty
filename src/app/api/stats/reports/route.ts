import { withAuth, json } from "@/lib/api";
import { reportStatsForRole } from "@/lib/services/stats";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => json(await reportStatsForRole(auth.role)));
}
