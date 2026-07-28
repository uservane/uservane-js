#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * Enforce the UX-SPEC core browser bundle ceiling: <= 15KB gzipped.
 * Runs against the production ESM build artifact.
 */
import { gzipSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const entry = resolve(root, "dist/index.js");
const CEILING = 15 * 1024; // 15KB gzipped

if (!existsSync(entry)) {
  console.error("dist/index.js missing — run `pnpm build` first");
  process.exit(1);
}

const raw = readFileSync(entry);
const gzipped = gzipSync(raw, { level: 9 });
const size = gzipped.length;

console.log(`bundle: ${raw.length} bytes raw, ${size} bytes gzipped (ceiling ${CEILING})`);

if (size > CEILING) {
  console.error(
    `FAIL: gzipped bundle ${size} exceeds ${CEILING} byte ceiling (${(size / 1024).toFixed(2)}KB > 15KB)`,
  );
  process.exit(1);
}

console.log("OK: within 15KB gzipped budget");
