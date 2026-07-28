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
  platform: "neutral",
  external: [
    "react",
    "react-native",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "@uservane/browser",
  ],
  esbuildOptions(options) {
    options.legalComments = "none";
  },
});
