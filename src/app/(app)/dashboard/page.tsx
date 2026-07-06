import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <DashboardClient />;
}
