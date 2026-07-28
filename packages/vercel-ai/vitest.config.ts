import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@uservane/vercel-ai",
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    testTimeout: 60_000,
  },
});
