import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@electric-sql/pglite", "playwright", "playwright-core", "agentmail", "exa-js", "@onkernel/sdk",
    "@neondatabase/serverless", "ws",
  ],
  devIndicators: false,
  // Pin the root: a stray lockfile in a parent folder otherwise changes where files are traced from.
  outputFileTracingRoot: process.cwd(),
  // Self-contained server bundle, built inside the Docker image (Windows can't create its symlinks).
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
