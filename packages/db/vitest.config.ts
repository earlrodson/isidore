import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 30000,
    // Test files share one live Postgres DB, truncated in beforeEach —
    // running files in parallel races truncate against another file's
    // in-flight inserts.
    fileParallelism: false,
  },
});
