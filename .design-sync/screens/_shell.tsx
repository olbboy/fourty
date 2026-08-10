/**
 * The app chrome every signed-in screen sits inside: the rail on the left, a
 * sticky header, and a fluid content column.
 *
 * Components come off `window.Fourty` rather than an import, because the screen
 * runs in the card next to the same bundle the design agent will import. React
 * is the vendored global for the same reason.
 *
 * Shared by every screen so the screens themselves stay about their own layout.
 */
declare const React: typeof import("react");

/** Everything the screens reach for, in one place. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DS: any = (globalThis as any).Fourty ?? {};

export const NAV = [
  "Dashboard",
  "Contacts",
  "Companies",
  "Deals",
  "Tasks",
  "Reports",
  "Workflows",
  "Settings",
];

export function Shell({
  active,
  title,
  children,
}: {
  active: string;
  title: string;
  children: React.ReactNode;
}) {
  const { Logo } = DS;
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "var(--font-sans)", color: "var(--text)" }}>
      {/* Rail. One step off white so it reads as chrome rather than page. */}
      <aside
        style={{
          width: "16rem",
          flexShrink: 0,
          background: "var(--sidebar)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: 8,
          gap: 4,
        }}
      >
        <div style={{ padding: "10px 8px 14px" }}>
          {Logo ? <Logo variant="full" height={20} title="Fourty" /> : null}
        </div>
        {NAV.map((item) => (
          <div
            key={item}
            style={{
              padding: "7px 10px",
              borderRadius: "var(--radius-md)",
              fontSize: 14,
              fontWeight: item === active ? 500 : 400,
              background: item === active ? "var(--surface-2)" : "transparent",
              color: item === active ? "var(--text)" : "var(--text-muted)",
            }}
          >
            {item}
          </div>
        ))}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
        <header
          style={{
            height: 56,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 32px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {title}
        </header>
        {/* Content is fluid, not centred in a max-width column — this is an
            admin surface, not a document. */}
        <main style={{ flex: 1, overflow: "auto", padding: 32 }}>{children}</main>
      </div>
    </div>
  );
}

/** Section heading used inside cards across the screens. */
export function CardTitleRow({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h2>
      {meta && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{meta}</p>}
    </div>
  );
}

export const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-xl)",
  padding: 16,
};
