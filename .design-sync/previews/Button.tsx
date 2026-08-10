import { Button } from "fourty";

export const Variants = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <Button>New deal</Button>
    <Button variant="secondary">Duplicate</Button>
    <Button variant="outline">Export CSV</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="destructive">Delete deal</Button>
    <Button variant="link">View pipeline</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <Button size="xs">xs</Button>
    <Button size="sm">sm</Button>
    <Button>default</Button>
    <Button size="lg">lg</Button>
  </div>
);

export const Disabled = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <Button disabled>Saving…</Button>
    <Button variant="outline" disabled>Export CSV</Button>
  </div>
);
