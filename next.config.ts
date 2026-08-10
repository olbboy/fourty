import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second dev server in this directory is refused, because Next keys its
  // dev lock on the build directory. The e2e suite needs one of its own — a
  // production build cannot show framework development warnings, and those are
  // exactly what it is there to catch — so the build directory is overridable.
  // Unset, this is Next's default and nothing changes.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Keep the Postgres driver, queue and logger out of the bundler (native /
  // worker-thread / optional deps that must load from node_modules at runtime).
  serverExternalPackages: ["pg", "pg-boss", "pino"],
  // Pin the tracing root to this project so a stray lockfile in a parent
  // directory can't make Next infer the wrong workspace root.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
