import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@uservane/copilotkit",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    testTimeout: 60_000,
  },
});
