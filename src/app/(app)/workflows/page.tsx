import { WorkflowsClient } from "./workflows-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workflows" };

export default function WorkflowsPage() {
  return <WorkflowsClient />;
}
