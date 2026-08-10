import { DS, Shell, CardTitleRow, card } from "./_shell";

declare const React: typeof import("react");

/**
 * The ⌘K palette over the page it was opened from.
 *
 * Dialog, Command and DropdownMenu each already have a component card, so this
 * is deliberately not a gallery of them — three open overlays cannot share one
 * frame anyway, because a dialog's scrim covers the whole viewport. What no
 * component card can show is the thing here: how an overlay sits over real
 * content, how far the scrim knocks that content back, and how much of the page
 * stays legible behind it.
 */
export function Screen() {
  const { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandSeparator, CommandShortcut, KpiCard } = DS;

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
      <Shell active="Dashboard" title="Dashboard">
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-0.025em" }}>Dashboard</h1>
          <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--text-muted)" }}>
            Live view of your pipeline — every number is clickable-deep in Reports.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <KpiCard label="Open pipeline" value="$306.4K" hint="5 open deals" />
          <KpiCard label="Weighted forecast" value="$186.5K" hint="Stage-probability adjusted" />
          <KpiCard label="Won this month" value="$48.0K" />
          <KpiCard label="Win rate (90d)" value="67%" hint="16d avg sales cycle" />
        </div>
        <section style={card}>
          <CardTitleRow title="Won revenue by month" meta="USD equivalent, last 6 months" />
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
            The page keeps its shape behind the scrim — the palette is a layer, not a screen.
          </p>
        </section>
      </Shell>

      {/* The product's own scrim: 30% black, no blur. Blur is used exactly once
          in this product (the assistant drawer) and the palette is not it. */}
      <div style={{ position: "absolute", inset: 0, background: "rgb(0 0 0 / 0.3)" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}>
        <Command style={{ width: 560, maxWidth: "90%", maxHeight: 380, border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", overflow: "hidden" }}>
          <CommandInput placeholder="Search records or run a command…" />
          <CommandList>
            <CommandGroup heading="Records">
              <CommandItem>Acme Corp</CommandItem>
              <CommandItem>Maya Chen</CommandItem>
              <CommandItem>Initech platform</CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem>
                New deal
                <CommandShortcut>⇧D</CommandShortcut>
              </CommandItem>
              <CommandItem>Toggle theme</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  );
}
