import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allCopyValues, COPY } from "@uservane/browser";
import { describe, expect, it } from "vitest";

const EM_DASH = "\u2014";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|md)$/.test(name)) out.push(full);
  }
  return out;
}

describe("no em-dashes", () => {
  it("browser COPY has no em-dash (shared with RN)", () => {
    for (const v of allCopyValues()) {
      expect(v.includes(EM_DASH)).toBe(false);
    }
    expect(COPY.thanks.includes(EM_DASH)).toBe(false);
  });

  it("RN package source and README have no em-dash", () => {
    for (const file of walk(join(root, "src")).concat([join(root, "README.md")])) {
      const text = readFileSync(file, "utf8");
      expect(text.includes(EM_DASH), file).toBe(false);
    }
  });
});
