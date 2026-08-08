/**
 * Next.js instrumentation hook (runs once per server process on boot). Starts
 * optional OpenTelemetry tracing (Gate B4) — a no-op unless
 * OTEL_EXPORTER_OTLP_ENDPOINT is configured — and logs which capability modules
 * are registered. Node runtime only.
 *
 * Capability *status* is per workspace and is not logged here: an install serves
 * many workspaces, so a process-wide "mailbox: on" would be false for most of
 * them. Status lives in Settings → Diagnostics.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initTracing } = await import("@/lib/otel");
    initTracing();
    const { logCapabilities } = await import("@/lib/capabilities");
    logCapabilities();
  }
}
