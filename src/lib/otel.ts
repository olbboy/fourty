import { createRequire } from "node:module";
import { log } from "@/lib/logger";

/**
 * Optional OpenTelemetry tracing (Gate B4). A no-op unless
 * OTEL_EXPORTER_OTLP_ENDPOINT is set. When it is, we start a NodeSDK with an
 * OTLP/HTTP trace exporter IF the OTel packages are installed — they are not a
 * hard dependency, so the base image stays lean and the build never pulls them.
 *
 * To enable end-to-end tracing:
 *   npm i @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http \
 *         @opentelemetry/auto-instrumentations-node
 *   export OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
 *
 * The require is done via createRequire with a variable specifier so bundlers
 * don't try to resolve the (possibly absent) packages at build time.
 */
let started = false;

export function initTracing(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || started) return;
  started = true;

  try {
    const req = createRequire(import.meta.url);
    const sdkPkg = "@opentelemetry/sdk-node";
    const otlpPkg = "@opentelemetry/exporter-trace-otlp-http";
    const autoPkg = "@opentelemetry/auto-instrumentations-node";

    const { NodeSDK } = req(sdkPkg);
    const { OTLPTraceExporter } = req(otlpPkg);
    let instrumentations: unknown[] = [];
    try {
      instrumentations = [req(autoPkg).getNodeAutoInstrumentations()];
    } catch {
      // auto-instrumentations optional — export manual spans without it.
    }

    const sdk = new NodeSDK({
      serviceName: "fourty",
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      instrumentations,
    });
    sdk.start();
    log().info({ endpoint }, "OpenTelemetry tracing started");
  } catch {
    log().warn(
      { endpoint },
      "OTEL_EXPORTER_OTLP_ENDPOINT is set but the OpenTelemetry SDK is not installed — tracing disabled. See src/lib/otel.ts.",
    );
  }
}
