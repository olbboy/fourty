import { EmptyState, Button } from "fourty";

export const NoTasks = () => (
  <EmptyState
    title="No tasks due"
    hint="Tasks you create from a record show up here."
    action={<Button size="sm">New task</Button>}
  />
);

export const HintOnly = () => (
  <EmptyState title="No results" hint="Try a different search term." />
);
