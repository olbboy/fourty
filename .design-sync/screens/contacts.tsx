import { DS, Shell } from "./_shell";

declare const React: typeof import("react");

const PEOPLE = [
  { first: "Maya", last: "Chen", role: "VP Engineering", company: "Initech", status: "customer", score: 90 },
  { first: "Jonas", last: "Weber", role: "Head of Procurement", company: "Globex", status: "qualified", score: 87 },
  { first: "Linh", last: "Tran", role: "CTO", company: "Lotus Retail", status: "qualified", score: 86 },
  { first: "Priya", last: "Nair", role: "Founder", company: "Northwind", status: "lead", score: 64 },
  { first: "Ken", last: "Adeyemi", role: "Ops Director", company: "Vertex", status: "churned", score: 31 },
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
  const { Avatar, StatusChip, ScoreBadge, Button } = DS;
  return (
    <Shell active="Contacts" title="Contacts">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em" }}>Contacts</h1>
          <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--text-muted)" }}>128 people</p>
        </div>
        <Button>New contact</Button>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={th}>Name</th>
              <th style={th}>Company</th>
              <th style={th}>Status</th>
              <th style={th}>Score</th>
            </tr>
          </thead>
          <tbody>
            {PEOPLE.map((p, i) => (
              <tr key={p.first} style={{ borderBottom: i === PEOPLE.length - 1 ? "none" : "1px solid color-mix(in srgb, var(--border) 60%, transparent)" }}>
                <td style={td}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={`${p.first} ${p.last}`} size={8} />
                    <span>
                      <span style={{ display: "block", fontWeight: 500 }}>
                        {p.first} {p.last}
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{p.role}</span>
                    </span>
                  </span>
                </td>
                <td style={{ ...td, color: "var(--text-muted)" }}>{p.company}</td>
                <td style={td}>
                  <StatusChip status={p.status} />
                </td>
                <td style={td}>
                  <ScoreBadge score={p.score} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
