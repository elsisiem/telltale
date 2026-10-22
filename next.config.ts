import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "playwright", "playwright-core", "agentmail", "exa-js", "@onkernel/sdk"],
  devIndicators: false,
};

export default nextConfig;
