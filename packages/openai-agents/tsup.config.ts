import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "tsup";

const CLIENT_DIRECTIVE = '"use client";\n';

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
  // Client: React re-exports only. No secret key path.
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
    platform: "browser",
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@uservane/agent-core",
      "@uservane/agent-react",
      "@uservane/browser",
      "@openai/agents",
      "langfuse",
    ],
    esbuildOptions(options) {
      options.legalComments = "none";
    },
    async onSuccess() {
      injectUseClient(["dist/index.js", "dist/index.cjs"]);
    },
  },
  // Server: fire-once run wrapper + mint. No React.
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
    external: ["@uservane/agent-core", "@uservane/agent-core/server", "@openai/agents", "langfuse"],
    esbuildOptions(options) {
      options.legalComments = "none";
    },
  },
  // Langfuse bridge: server-only.
  {
    entry: { langfuse: "src/langfuse.ts" },
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
    external: ["@openai/agents", "langfuse"],
    esbuildOptions(options) {
      options.legalComments = "none";
    },
  },
]);
