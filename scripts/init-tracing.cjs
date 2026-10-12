"use strict";

/**
 * Optional OpenTelemetry loader, kept outside the Next/Turbopack graph.
 *
 * `npm start` and the Docker CMD preload this file (`node -r`) so the Next
 * compile never sees the `@opentelemetry/*` specifiers. No-op unless
 * OTEL_EXPORTER_OTLP_ENDPOINT is set.
 */
const { createRequire } = require("node:module");
const req = createRequire(__filename);

let started = false;

function initTracing() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || started) return { ok: true, skipped: true };
  started = true;
  try {
    const { NodeSDK } = req("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = req("@opentelemetry/exporter-trace-otlp-http");
    let instrumentations = [];
    try {
      instrumentations = [req("@opentelemetry/auto-instrumentations-node").getNodeAutoInstrumentations()];
    } catch {
      // auto-instrumentations optional — export manual spans without it.
    }
    const sdk = new NodeSDK({
      serviceName: "fourty",
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      instrumentations,
    });
    sdk.start();
    return { ok: true, skipped: false };
  } catch {
    return { ok: false, skipped: false };
  }
}

initTracing();
module.exports = { initTracing };
