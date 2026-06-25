import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      // Composition root (wiring) and type-only/entry files carry no testable logic.
      exclude: ["src/**/*.test.ts", "src/infrastructure/http/server.ts"],
      thresholds: {
        statements: 80,
        branches: 85,
        functions: 75,
        lines: 80,
      },
    },
  },
});
