import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { initTracing } from "@/lib/otel";

/**
 * OTel packages are optional. Turbopack traces a `@opentelemetry/…` literal in
 * anything it compiles. The Next graph (instrumentation.ts) must not import
 * otel.ts; the app process preloads scripts/init-tracing.cjs instead.
 */
describe("optional OpenTelemetry", () => {
  it("is a no-op when no exporter is configured", () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    expect(() => initTracing()).not.toThrow();
  });

  it("is not imported from Next instrumentation", () => {
    const src = readFileSync(path.resolve(__dirname, "../src/instrumentation.ts"), "utf8");
    expect(src).not.toMatch(/from ["']@\/lib\/otel["']/);
    expect(src).not.toMatch(/import\(["']@\/lib\/otel["']\)/);
  });

  it("preloads a CJS loader outside the Next graph on npm start and npm run dev", () => {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf8")) as {
      scripts: { start: string; dev: string };
    };
    expect(pkg.scripts.start).toContain("scripts/init-tracing.cjs");
    expect(pkg.scripts.dev).toContain("scripts/init-tracing.cjs");
    const cjs = readFileSync(path.resolve(__dirname, "../scripts/init-tracing.cjs"), "utf8");
    expect(cjs).toContain("@opentelemetry/sdk-node");
    expect(cjs).toMatch(/^initTracing\(\);$/m);
  });
});
