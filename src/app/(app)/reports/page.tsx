import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return <ReportsClient />;
}
