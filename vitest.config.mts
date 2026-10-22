import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: { exclude: ["**/node_modules/**", "**/.claude/**"], environment: "node", env: { TELLTALE_DB_DIR: "memory://" }, testTimeout: 20000 },
});
