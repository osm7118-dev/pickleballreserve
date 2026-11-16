import { defineConfig } from "vitest/config";
import path from "node:path";
import { testDatabaseUrl } from "./tests/setup/test-db-url";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/setup/global-setup.ts"],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl(),
    },
  },
});
