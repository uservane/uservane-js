import { defineConfig } from "tsup";

/**
 * Server-only package. platform: "node", no React/DOM, no "use client".
 * Langfuse SDK stays external so the customer resolves their pin.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
  target: "es2020",
  outDir: "dist",
  splitting: false,
  platform: "node",
  external: ["langfuse"],
  esbuildOptions(options) {
    options.legalComments = "none";
  },
});
