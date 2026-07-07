import { withAuth, json } from "@/lib/api";
import { computeDashboardStats } from "@/lib/services/stats";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
  return json(await computeDashboardStats());
  });
}
