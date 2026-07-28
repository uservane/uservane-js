import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  treeshake: true,
  target: "es2020",
  outDir: "dist",
  splitting: false,
  // Keep global name free; consumers import the module. No IIFE/global pollution.
  platform: "browser",
  esbuildOptions(options) {
    options.legalComments = "none";
  },
});
