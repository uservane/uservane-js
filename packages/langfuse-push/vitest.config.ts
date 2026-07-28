import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@uservane/langfuse-push",
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
