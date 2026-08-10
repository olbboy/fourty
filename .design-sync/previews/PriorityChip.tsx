import { PriorityChip } from "fourty";

export const AllPriorities = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <PriorityChip priority="high" />
    <PriorityChip priority="medium" />
    <PriorityChip priority="low" />
  </div>
);
