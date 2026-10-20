import { defineConfig } from "vitest/config";

// Unit tests: no MongoDB, Redis or network needed
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
