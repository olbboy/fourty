import { Switch, Label } from "fourty";

export const States = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 320 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Label htmlFor="s1">Keyless research</Label><Switch id="s1" defaultChecked />
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Label htmlFor="s2">AI assistant</Label><Switch id="s2" />
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Label htmlFor="s3">SAML (unavailable)</Label><Switch id="s3" disabled />
    </div>
  </div>
);
