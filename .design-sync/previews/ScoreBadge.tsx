import { ScoreBadge } from "fourty";

// Bands run red -> amber -> blue: an orange "hot" chip beside the brand-orange
// primary button would stop meaning anything.
export const Bands = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <ScoreBadge score={82} />
    <ScoreBadge score={54} />
    <ScoreBadge score={19} />
  </div>
);

export const InRow = () => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
    <span style={{ fontWeight: 600 }}>Dana Whitfield</span>
    <ScoreBadge score={82} />
  </div>
);
