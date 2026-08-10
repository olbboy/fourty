import { KpiCard } from "fourty";

// The hint is where a number gets qualified. A win rate carries its window, a
// forecast its method — this product does not ship a bare figure.
export const Row = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, maxWidth: 520 }}>
    <KpiCard label="Open pipeline" value="$306.4K" hint="5 open deals" />
    <KpiCard label="Weighted forecast" value="$186.5K" hint="Stage-probability adjusted" />
    <KpiCard label="Won this month" value="$0" />
    <KpiCard label="Win rate (90d)" value="67%" hint="16d avg sales cycle" />
  </div>
);

export const WithoutHint = () => (
  <div style={{ maxWidth: 250 }}>
    <KpiCard label="Won this month" value="$48,000" />
  </div>
);
