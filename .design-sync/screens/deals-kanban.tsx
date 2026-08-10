import { DS, Shell, card } from "./_shell";

declare const React: typeof import("react");

const STAGES = [
  { name: "Lead", color: "#a89f99", total: "$22K", deals: [{ n: "Northwind — pilot", v: "$12,000", c: "Northwind" }, { n: "Vertex onboarding", v: "$10,000", c: "Vertex" }] },
  { name: "Qualified", color: "#51a2ff", total: "$56.3K", deals: [{ n: "Globex expansion", v: "$56,300", c: "Globex" }] },
  { name: "Demo", color: "#a684ff", total: "$35.1K", deals: [{ n: "Lotus Retail rollout", v: "$35,100", c: "Lotus Retail" }] },
  { name: "Proposal", color: "#ffb900", total: "$48K", deals: [{ n: "Acme Corp — renewal", v: "$48,000", c: "Acme Corp" }] },
  { name: "Negotiation", color: "#ff8b33", total: "$145K", deals: [{ n: "Initech platform", v: "$145,000", c: "Initech" }] },
];

export function Screen() {
  const { StageDot } = DS;
  return (
    <Shell active="Deals" title="Deals">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em" }}>Deals</h1>
          <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--text-muted)" }}>6 deals · $306.4K total</p>
        </div>
      </div>

      {/* Columns are fixed width and the board scrolls — a pipeline is read
          left to right, not reflowed. */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
        {STAGES.map((s) => (
          <div
            key={s.name}
            style={{
              width: 256,
              flexShrink: 0,
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--border)",
              background: "color-mix(in srgb, var(--surface-2) 50%, transparent)",
              padding: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 6px 8px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <StageDot color={s.color} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.deals.length}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>{s.total}</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {s.deals.map((d) => (
                <div key={d.n} style={{ ...card, padding: 12, boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{d.n}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 600, color: "var(--color-accent-700)" }}>{d.v}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{d.c}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
