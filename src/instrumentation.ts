/**
 * Next.js instrumentation hook (runs once per server process on boot). Logs
 * which capability modules are registered. Node runtime only.
 *
 * Optional OpenTelemetry is started outside this file: Turbopack traces any
 * `@opentelemetry/*` specifier it compiles and warns (or errors) when the
 * packages are absent. `npm start` preloads `scripts/init-tracing.cjs`; the
 * worker calls `initTracing()` from `src/lib/otel.ts` via tsx.
 *
 * Capability *status* is per workspace and is not logged here: an install serves
 * many workspaces, so a process-wide "mailbox: on" would be false for most of
 * them. Status lives in Settings → Diagnostics.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logCapabilities } = await import("@/lib/capabilities");
    logCapabilities();
  }
}
