import { StatusChip } from "fourty";

// Each chip is a 10% wash behind saturated text, never a solid fill.
export const AllStatuses = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <StatusChip status="lead" />
    <StatusChip status="qualified" />
    <StatusChip status="customer" />
    <StatusChip status="churned" />
  </div>
);
