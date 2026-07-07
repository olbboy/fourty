import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Postgres driver out of the bundler (native/optional deps).
  serverExternalPackages: ["pg"],
};

export default nextConfig;
