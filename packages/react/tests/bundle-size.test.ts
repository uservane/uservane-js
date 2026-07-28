import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** UX-SPEC: React wrapper <= 3KB gzipped on top of core. */
const CEILING = 3 * 1024;

describe("bundle size ceiling", () => {
  it("wrapper ESM build is <= 3KB gzipped (React and browser SDK external)", () => {
    execSync("pnpm exec tsup", { cwd: root, stdio: "pipe" });
    const entry = join(root, "dist/index.js");
    expect(existsSync(entry)).toBe(true);
    const raw = readFileSync(entry);
    const gzipped = gzipSync(raw, { level: 9 });
    // Visible in test output when over budget.
    // eslint-disable-next-line no-console
    console.log(`gzipped=${gzipped.length} ceiling=${CEILING}`);
    expect(gzipped.length).toBeLessThanOrEqual(CEILING);

    // Sanity: production bundle must not embed React; Next needs "use client".
    const text = raw.toString("utf8");
    expect(text.startsWith('"use client"')).toBe(true);
    expect(text.includes('from"react"') || text.includes("from'react'")).toBe(true);
    expect(text.includes("createElement")).toBe(false);
    expect(text.includes("useState")).toBe(false);
  });
});
