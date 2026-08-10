import { Input } from "fourty";

export const Default = () => (
  <div style={{ display: "grid", gap: 10, maxWidth: 320 }}>
    <Input placeholder="Search contacts…" />
    <Input defaultValue="acme.com" />
    <Input placeholder="Disabled" disabled />
  </div>
);

export const Invalid = () => (
  <div style={{ maxWidth: 320 }}>
    <Input defaultValue="not-an-email" aria-invalid />
  </div>
);
