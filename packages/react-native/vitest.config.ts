import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@uservane/react-native",
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    testTimeout: 60_000,
    setupFiles: ["./tests/setup.ts"],
  },
});
