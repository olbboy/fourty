import { DS } from "./_shell";

declare const React: typeof import("react");

/**
 * The signed-out screen. The lockup is the heading — setting "Fourty" in a font
 * beside the artwork says the name twice.
 */
export function Screen() {
  const { Logo, Field, FieldLabel, Input, Button } = DS;
  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "var(--bg)",
        fontFamily: "var(--font-sans)",
        color: "var(--text)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 384 }}>
        <div style={{ marginBottom: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0 }}>
            <Logo variant="full" height={34} title="Fourty" />
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>Sign in to your workspace</p>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
            padding: 24,
            display: "grid",
            gap: 16,
          }}
        >
          <Field>
            <FieldLabel htmlFor="s-email">Email</FieldLabel>
            <Input id="s-email" placeholder="you@company.com" />
          </Field>
          <Field>
            <FieldLabel htmlFor="s-pass">Password</FieldLabel>
            <Input id="s-pass" type="password" defaultValue="password" />
          </Field>
          <Button style={{ width: "100%" }}>Sign in</Button>
        </div>

        <p style={{ marginTop: 24, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          One process, one Postgres, zero infrastructure.
        </p>
      </div>
    </main>
  );
}
