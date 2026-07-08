import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Postgres driver, queue and logger out of the bundler (native /
  // worker-thread / optional deps that must load from node_modules at runtime).
  serverExternalPackages: ["pg", "pg-boss", "pino"],
  // Pin the tracing root to this project so a stray lockfile in a parent
  // directory can't make Next infer the wrong workspace root.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
