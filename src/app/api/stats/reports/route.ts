import { withAuth, json } from "@/lib/api";
import { computeReportStats } from "@/lib/services/stats";

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
  return json(await computeReportStats());
  });
}
