import { getSessionUser, roleInWorkspace } from "@/lib/auth";
import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await getSessionUser();
  const role = user?.workspaceId ? await roleInWorkspace(user.id, user.workspaceId) : null;
  return <ReportsClient isAdmin={role === "admin"} />;
}
