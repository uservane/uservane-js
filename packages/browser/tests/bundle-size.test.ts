import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CEILING = 15 * 1024;

describe("bundle size ceiling", () => {
  it("core ESM build is <= 15KB gzipped", () => {
    // Build production bundle.
    execSync("pnpm exec tsup", { cwd: root, stdio: "pipe" });
    const entry = join(root, "dist/index.js");
    expect(existsSync(entry)).toBe(true);
    const raw = readFileSync(entry);
    const gzipped = gzipSync(raw, { level: 9 });
    // Visible in test output when over budget.
    // eslint-disable-next-line no-console
    console.log(`gzipped=${gzipped.length} ceiling=${CEILING}`);
    expect(gzipped.length).toBeLessThanOrEqual(CEILING);
  });
});
