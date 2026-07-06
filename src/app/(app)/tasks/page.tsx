import { TasksClient } from "./tasks-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks" };

export default function TasksPage() {
  return <TasksClient />;
}
