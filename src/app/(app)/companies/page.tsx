import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import { CompaniesClient } from "./companies-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies" };

export default async function CompaniesPage() {
  const user = await getSessionUser();
  return (
    <Suspense>
      <CompaniesClient workspaceKey={user?.workspaceId ?? "none"} />
    </Suspense>
  );
}
