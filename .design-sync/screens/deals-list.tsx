import { DS, Shell } from "./_shell";

declare const React: typeof import("react");

const DEALS = [
  { name: "Initech platform", value: "$145,000", stage: "Negotiation", color: "#ff8b33", company: "Initech", close: "12 Mar" },
  { name: "Globex expansion", value: "$56,300", stage: "Qualified", color: "#51a2ff", company: "Globex", close: "28 Mar" },
  { name: "Acme Corp — renewal", value: "$48,000", stage: "Proposal", color: "#ffb900", company: "Acme Corp", close: "04 Apr" },
  { name: "Lotus Retail rollout", value: "$35,100", stage: "Demo", color: "#a684ff", company: "Lotus Retail", close: "19 Apr" },
  { name: "Northwind — pilot", value: "$12,000", stage: "Lead", color: "#a89f99", company: "Northwind", close: "02 May" },
];

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.025em",
  color: "var(--text-muted)",
};
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 14 };

export function Screen() {
  const { StageDot } = DS;
  return (
    <Shell active="Deals" title="Deals">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em" }}>Deals</h1>
        <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--text-muted)" }}>6 deals · $306.4K total</p>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={th}>Deal</th>
              <th style={th}>Value</th>
              <th style={th}>Stage</th>
              <th style={th}>Company</th>
              <th style={th}>Close</th>
            </tr>
          </thead>
          <tbody>
            {DEALS.map((d, i) => (
              <tr key={d.name} style={{ borderBottom: i === DEALS.length - 1 ? "none" : "1px solid color-mix(in srgb, var(--border) 60%, transparent)" }}>
                <td style={{ ...td, fontWeight: 500 }}>{d.name}</td>
                <td style={td}>{d.value}</td>
                <td style={td}>
                  {/* The dot carries the stage colour; the name carries the
                      meaning. A colour alone would be the only cue. */}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <StageDot color={d.color} />
                    {d.stage}
                  </span>
                </td>
                <td style={{ ...td, color: "var(--text-muted)" }}>{d.company}</td>
                <td style={{ ...td, color: "var(--text-muted)" }}>{d.close}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
