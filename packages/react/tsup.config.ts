import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";

const CLIENT_DIRECTIVE = '"use client";\n';

/** esbuild strips module directives during bundle; re-inject for Next App Router. */
function injectUseClient(files: string[]): void {
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    if (content.startsWith('"use client"') || content.startsWith("'use client'")) {
      continue;
    }
    writeFileSync(file, `${CLIENT_DIRECTIVE}${content}`);
  }
}

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
  platform: "browser",
  // React and the browser SDK stay external (peer / dependency). Never bundle them.
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "@uservane/browser",
  ],
  esbuildOptions(options) {
    options.legalComments = "none";
  },
  async onSuccess() {
    injectUseClient(["dist/index.js", "dist/index.cjs"]);
  },
});
