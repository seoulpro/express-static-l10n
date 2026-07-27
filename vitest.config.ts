import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      thresholds: {
        branches: 84,
        functions: 95,
        lines: 88,
        statements: 88
      }
    },
    include: ["test/**/*.test.ts"]
  }
});
