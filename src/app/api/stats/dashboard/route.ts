import { authenticate, json } from "@/lib/api";
import { computeDashboardStats } from "@/lib/services/stats";

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  return json(computeDashboardStats());
}
