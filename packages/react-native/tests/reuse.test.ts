/**
 * Assert the RN package reuses browser show-decision / client / scale
 * rather than reimplementing them (drift risk).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideShow,
  fetchBootstrap,
  isLowScoreFollowUp,
  isSampledIn,
  scaleForType,
  submitResponse,
} from "@uservane/browser";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("core reuse from @uservane/browser", () => {
  it("imports decideShow, client, scale, sampling from browser (live symbols)", () => {
    expect(typeof decideShow).toBe("function");
    expect(typeof fetchBootstrap).toBe("function");
    expect(typeof submitResponse).toBe("function");
    expect(typeof scaleForType).toBe("function");
    expect(typeof isLowScoreFollowUp).toBe("function");
    expect(typeof isSampledIn).toBe("function");
  });

  it("source does not reimplement show-decision math or sampling hash", () => {
    const files = walkTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const joined = files.map((f) => readFileSync(f, "utf8")).join("\n");

    // Must import from browser for the integrity core.
    expect(joined).toMatch(/from ["']@uservane\/browser["']/);
    expect(joined).toMatch(/decideShow/);
    expect(joined).toMatch(/fetchBootstrap/);
    expect(joined).toMatch(/submitResponse/);

    // Must not contain a local FNV-1a / sampling reimplementation.
    expect(joined).not.toMatch(/0x811c9dc5/);
    expect(joined).not.toMatch(/function isSampledIn/);
    expect(joined).not.toMatch(/function decideShow/);
    expect(joined).not.toMatch(/function fetchBootstrap/);
    expect(joined).not.toMatch(/function submitResponse/);
  });

  it("source never touches window or document (RN has neither)", () => {
    const files = walkTsFiles(srcDir);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // Allow comments mentioning the rule; ban real access patterns.
      expect(src).not.toMatch(/\bwindow\./);
      expect(src).not.toMatch(/\bdocument\./);
      expect(src).not.toMatch(/localStorage/);
      expect(src).not.toMatch(/matchMedia/);
    }
  });
});
