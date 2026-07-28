import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@uservane/browser",
    include: ["tests/**/*.test.ts"],
    environment: "happy-dom",
    // Node 25+: ensure localStorage exists (happy-dom / experimental Node LS).
    setupFiles: ["tests/setup.ts"],
    // Bundle-size check runs a real build; allow a longer suite timeout.
    testTimeout: 60_000,
  },
});
