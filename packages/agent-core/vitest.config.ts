import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@uservane/agent-core",
    include: ["tests/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    testTimeout: 60_000,
  },
});
