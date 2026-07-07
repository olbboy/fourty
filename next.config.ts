import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Postgres driver out of the bundler (native/optional deps).
  serverExternalPackages: ["pg"],
  // Pin the tracing root to this project so a stray lockfile in a parent
  // directory can't make Next infer the wrong workspace root.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
