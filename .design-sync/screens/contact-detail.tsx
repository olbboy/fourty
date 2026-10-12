import { DS, Shell, CardTitleRow, card } from "./_shell";

declare const React: typeof import("react");

const FIELDS = [
  ["Job title", "VP Engineering"],
  ["Company", "Initech"],
  ["Email", "maya.chen@initech.com"],
  ["Phone", "+84 28 3822 1188"],
  ["Source", "Referral"],
  ["City", "Ho Chi Minh City"],
];

export function Screen() {
  const { Avatar, StatusChip, ScoreBadge, Button, Tabs, TabsList, TabsTrigger, TabsContent, StageDot } = DS;
  return (
    <Shell active="Contacts" title="Contacts">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name="Maya Chen" size={11} />
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em" }}>Maya Chen</h1>
            <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--text-muted)" }}>
              VP Engineering · <span style={{ color: "var(--color-accent-700)" }}>Initech</span>
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusChip status="customer" />
          <ScoreBadge score={90} />
          <Button variant="outline" size="sm">Edit</Button>
        </div>
      </div>

      {/* Three columns: the record, its conversation, its related objects. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "start" }}>
        <section style={card}>
          <CardTitleRow title="Details" />
          <div style={{ display: "grid", gap: 12 }}>
            {FIELDS.map(([label, value]) => (
              <div key={label}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.025em", color: "var(--text-muted)" }}>
                  {label}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 14 }}>{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={card}>
          <Tabs defaultValue="activity">
            <TabsList>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            </TabsList>
            <TabsContent value="activity" style={{ paddingTop: 12 }}>
              <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                <div>
                  Moved <b style={{ fontWeight: 600 }}>Initech platform</b> to Negotiation
                  <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>2 days ago</span>
                </div>
                <div>
                  Job title filled from a mailbox signature
                  <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>5 days ago · reverts in one click</span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </section>

        <section style={card}>
          <CardTitleRow title="Deals (1)" />
          <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-lg)", padding: "8px 12px" }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Initech platform</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
              $145,000
              <StageDot color="#ff8b33" />
              Negotiation
            </p>
          </div>
        </section>
      </div>
    </Shell>
  );
}
