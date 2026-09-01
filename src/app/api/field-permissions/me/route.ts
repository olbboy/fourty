import { withAuth, json } from "@/lib/api";
import { fieldAccessForPolicy, loadFieldPolicy } from "@/lib/field-permissions";

/** The caller's own field restrictions. Management stays admin-only on `/`. */
export async function GET(req: Request) {
  return withAuth(req, async (auth) => json(fieldAccessForPolicy(await loadFieldPolicy(auth.role))));
}
