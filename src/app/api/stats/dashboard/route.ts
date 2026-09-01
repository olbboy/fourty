import { withAuth, json } from "@/lib/api";
import { dashboardStatsForRole } from "@/lib/services/stats";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => json(await dashboardStatsForRole(auth.role)));
}
