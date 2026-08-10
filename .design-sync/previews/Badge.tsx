import { Badge } from "fourty";

export const Variants = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <Badge>Enterprise</Badge>
    <Badge variant="secondary">Inbound</Badge>
    <Badge variant="outline">Renewal</Badge>
    <Badge variant="destructive">Overdue</Badge>
    <Badge variant="ghost">Draft</Badge>
  </div>
);

export const InContext = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
    <span style={{ fontWeight: 600 }}>Acme Corp</span>
    <Badge variant="secondary">120 employees</Badge>
    <Badge>Customer</Badge>
  </div>
);
