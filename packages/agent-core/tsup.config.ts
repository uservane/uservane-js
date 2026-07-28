import { defineConfig } from "tsup";

export default defineConfig([
  {
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
    external: ["@uservane/browser"],
    esbuildOptions(options) {
      options.legalComments = "none";
    },
  },
  {
    entry: ["src/server.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    minify: true,
    treeshake: true,
    target: "es2020",
    outDir: "dist",
    splitting: false,
    platform: "node",
    external: [],
    esbuildOptions(options) {
      options.legalComments = "none";
    },
  },
]);
