import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // The /api/ingest and /api/ingest/environment route test files share
    // one live Postgres DB, truncated in beforeEach — running them in
    // parallel races truncate against another file's in-flight inserts
    // (same reasoning as packages/db's vitest.config.ts).
    fileParallelism: false,
  },
});
