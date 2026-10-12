import { DS, Shell, CardTitleRow, card } from "./_shell";

declare const React: typeof import("react");

const MEMBERS = [
  { name: "Dana Whitfield", email: "dana@fourty.dev", role: "Admin" },
  { name: "Maya Chen", email: "maya@initech.com", role: "Member" },
  { name: "Ken Adeyemi", email: "ken@vertex.io", role: "Viewer" },
];

const TOGGLES = [
  ["Keyless research", "Mine your own mailbox for job titles and company links.", true],
  ["AI assistant", "BYO-key chat that proposes writes you confirm.", false],
  ["Signed webhooks", "Sign every outgoing payload with the workspace secret.", true],
] as const;

export function Screen() {
  const { Field, FieldLabel, FieldDescription, Input, Switch, Label, Avatar, Badge, Button } = DS;
  return (
    <Shell active="Settings" title="Settings">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em" }}>Settings</h1>
        <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--text-muted)" }}>Workspace, members and integrations</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <section style={card}>
          <CardTitleRow title="Workspace" />
          <div style={{ display: "grid", gap: 14 }}>
            <Field>
              <FieldLabel htmlFor="w-name">Name</FieldLabel>
              <Input id="w-name" defaultValue="Fourty HQ" />
            </Field>
            <Field>
              <FieldLabel htmlFor="w-domain">Primary domain</FieldLabel>
              <Input id="w-domain" defaultValue="fourty.dev" />
              <FieldDescription>New contacts on this domain link to the workspace automatically.</FieldDescription>
            </Field>
            <div>
              <Button size="sm">Save changes</Button>
            </div>
          </div>
        </section>

        <section style={card}>
          <CardTitleRow title="Features" meta="Every one of these is off by default and useful without the others." />
          <div style={{ display: "grid", gap: 14 }}>
            {TOGGLES.map(([name, hint, on]) => (
              <div key={name} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <span style={{ minWidth: 0 }}>
                  <Label htmlFor={`t-${name}`}>{name}</Label>
                  <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{hint}</span>
                </span>
                <Switch id={`t-${name}`} defaultChecked={on} />
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...card, gridColumn: "1 / -1" }}>
          <CardTitleRow title="Members" meta="3 people · roles decide what each can read and write" />
          <div style={{ display: "grid", gap: 2 }}>
            {MEMBERS.map((m) => (
              <div
                key={m.email}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--radius-lg)", background: "var(--surface-2)" }}
              >
                <Avatar name={m.name} size={8} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{m.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{m.email}</span>
                </span>
                <Badge variant="secondary">{m.role}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  );
}
