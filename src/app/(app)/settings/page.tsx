import { getSessionUser, roleInWorkspace } from "@/lib/auth";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  const role = user?.workspaceId ? await roleInWorkspace(user.id, user.workspaceId) : null;
  const canManagePipelines = role === "admin" || role === "member";
  return <SettingsClient canManagePipelines={canManagePipelines} />;
}
