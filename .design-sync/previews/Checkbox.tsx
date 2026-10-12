import { Checkbox, Label } from "fourty";

export const States = () => (
  <div style={{ display: "grid", gap: 10 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Checkbox id="c1" defaultChecked /><Label htmlFor="c1">Only my deals</Label>
    </div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Checkbox id="c2" /><Label htmlFor="c2">Include closed</Label>
    </div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Checkbox id="c3" disabled /><Label htmlFor="c3">Archived (disabled)</Label>
    </div>
  </div>
);
