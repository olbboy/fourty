/**
 * Next.js instrumentation hook (runs once per server process on boot). Used to
 * start optional OpenTelemetry tracing (Gate B4) — a no-op unless
 * OTEL_EXPORTER_OTLP_ENDPOINT is configured. Node runtime only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initTracing } = await import("@/lib/otel");
    initTracing();
  }
}
