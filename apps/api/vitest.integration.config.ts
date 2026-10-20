import { defineConfig } from "vitest/config";

// Integration tests: real MongoDB and Redis (npm run infra:up, or CI service containers).
// Files run one at a time because they share a Redis database.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.int.test.ts"],
    globalSetup: ["test/integration/globalSetup.ts"],
    setupFiles: ["test/integration/env.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
