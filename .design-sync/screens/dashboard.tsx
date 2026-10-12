import { DS, Shell, CardTitleRow, card } from "./_shell";

declare const React: typeof import("react");

const KPIS = [
  { label: "Open pipeline", value: "$306.4K", hint: "5 open deals" },
  { label: "Weighted forecast", value: "$186.5K", hint: "Stage-probability adjusted" },
  { label: "Won this month", value: "$48.0K" },
  { label: "Win rate (90d)", value: "67%", hint: "16d avg sales cycle" },
];

const FUNNEL = [
  { stage: "Lead", value: 22, color: "#a89f99" },
  { stage: "Qualified", value: 56.3, color: "#51a2ff" },
  { stage: "Demo", value: 35.1, color: "#a684ff" },
  { stage: "Proposal", value: 48, color: "#ffb900" },
  { stage: "Negotiation", value: 145, color: "#ff8b33" },
];

const LEADS = [
  { name: "Maya Chen", role: "VP Engineering", score: 90 },
  { name: "Jonas Weber", role: "Head of Procurement", score: 87 },
  { name: "Linh Tran", role: "CTO", score: 86 },
];

const TASKS = [
  { title: "Reconnect with Ken about renewal", priority: "medium", due: "Aug 8", overdue: true },
  { title: "Send revised proposal to Acme", priority: "high", due: "Aug 11" },
  { title: "Schedule demo with Lotus Retail", priority: "high", due: "Aug 13" },
];

/** A bar row — the funnel here is static so the card needs no chart runtime. */
function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 92, fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ flex: 1, height: 10, borderRadius: 3, background: "var(--surface-2)" }}>
        <span style={{ display: "block", height: "100%", width: `${(value / max) * 100}%`, borderRadius: 3, background: color }} />
      </span>
      <span style={{ width: 54, textAlign: "right", fontSize: 11, color: "var(--text-muted)" }}>${value}K</span>
    </div>
  );
}

export function Screen() {
  const { KpiCard, ScoreBadge, PriorityChip, Badge } = DS;
  const maxFunnel = Math.max(...FUNNEL.map((f) => f.value));

  return (
    <Shell active="Dashboard" title="Dashboard">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em" }}>Dashboard</h1>
        <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--text-muted)" }}>
          Live view of your pipeline — every number is clickable-deep in Reports.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {KPIS.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <section style={card}>
          <CardTitleRow title="Won revenue by month" meta="USD equivalent, last 6 months" />
          <div style={{ display: "grid", gap: 8 }}>
            {[
              { m: "Apr", v: 12 },
              { m: "May", v: 34 },
              { m: "Jun", v: 8 },
              { m: "Jul", v: 96 },
              { m: "Aug", v: 48 },
            ].map((r) => (
              <Bar key={r.m} label={r.m} value={r.v} max={96} color="var(--chart-2)" />
            ))}
          </div>
        </section>
        <section style={card}>
          <CardTitleRow title="Pipeline funnel" meta="Open value by stage" />
          <div style={{ display: "grid", gap: 8 }}>
            {FUNNEL.map((f) => (
              <Bar key={f.stage} label={f.stage} value={f.value} max={maxFunnel} color="var(--chart-2)" />
            ))}
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <section style={card}>
          <CardTitleRow title="🔥 Hottest leads" />
          <div style={{ display: "grid", gap: 8 }}>
            {LEADS.map((l) => (
              <div
                key={l.name}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "var(--surface-2)", borderRadius: "var(--radius-lg)", padding: "8px 12px" }}
              >
                <span>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{l.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{l.role}</span>
                </span>
                <ScoreBadge score={l.score} />
              </div>
            ))}
          </div>
        </section>

        <section style={card}>
          <CardTitleRow title="Tasks due" />
          <div style={{ marginTop: -6, marginBottom: 10 }}>
            <Badge variant="destructive">1 overdue</Badge>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {TASKS.map((t) => (
              <div key={t.title} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <PriorityChip priority={t.priority} />
                  <span style={{ fontSize: 12, color: t.overdue ? "var(--destructive)" : "var(--text-muted)", fontWeight: t.overdue ? 600 : 400 }}>
                    {t.due}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section style={card}>
          <CardTitleRow title="⚠️ Stale deals" meta="In the same stage for 14+ days" />
          <p style={{ margin: 0, fontSize: 14 }}>No stuck deals. Keep it moving!</p>
        </section>
      </div>
    </Shell>
  );
}
