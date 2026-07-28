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

export default defineConfig([
  // Client: React capture UI + resolution hook. No secret key path.
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    minify: true,
    treeshake: true,
    target: "es2020",
    outDir: "dist",
    splitting: false,
    platform: "browser",
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@uservane/agent-core",
      "@uservane/agent-react",
      "@uservane/browser",
      "@copilotkit/react-core",
      "@copilotkit/react-core/v2",
      "@copilotkit/react-core/v2/headless",
    ],
    esbuildOptions(options) {
      options.legalComments = "none";
    },
    async onSuccess() {
      injectUseClient(["dist/index.js", "dist/index.cjs"]);
    },
  },
  // Server: re-export mintFeedbackToken. No React.
  {
    entry: ["src/server.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    minify: false,
    treeshake: true,
    target: "es2020",
    outDir: "dist",
    splitting: false,
    platform: "node",
    external: ["@uservane/agent-core", "@uservane/agent-core/server"],
    esbuildOptions(options) {
      options.legalComments = "none";
    },
  },
]);
