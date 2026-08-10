import { StageDot } from "fourty";

// The colour is workspace data — a stage can be recoloured per workspace — so
// it arrives as a prop rather than a class. The dot never appears alone; the
// stage name sits beside it and carries the meaning.
const STAGES = [
  { name: "Lead", color: "#a89f99" },
  { name: "Qualified", color: "#51a2ff" },
  { name: "Demo", color: "#a684ff" },
  { name: "Proposal", color: "#ffb900" },
  { name: "Negotiation", color: "#ff8b33" },
  { name: "Won", color: "#00d492" },
  { name: "Lost", color: "#ff6467" },
];

export const Pipeline = () => (
  <div style={{ display: "grid", gap: 8 }}>
    {STAGES.map((s) => (
      <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
        <StageDot color={s.color} />
        <span style={{ fontWeight: 600 }}>{s.name}</span>
      </div>
    ))}
  </div>
);

export const ColumnHead = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
    <StageDot color="#ff8b33" />
    <span style={{ fontWeight: 600 }}>Negotiation</span>
    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>4</span>
  </div>
);
