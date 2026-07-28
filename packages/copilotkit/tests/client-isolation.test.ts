/**
 * Client entry must never expose or import the secret-key / server mint path.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("client entry isolation", () => {
  it("src/index.ts does not import server mint or secret key paths", () => {
    const src = readFileSync(join(__dirname, "../src/index.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bmintFeedbackToken\b/);
    expect(code).not.toMatch(/uv_sk_/);
    expect(code).not.toMatch(/\bsecretKey\b/);
    expect(code).not.toMatch(/from\s+["'][^"']*server["']/);
    expect(code).not.toMatch(/USERVANE_SECRET/);
    expect(code).toMatch(/from\s+["']@uservane\/agent-core["']/);
    expect(code).toMatch(/from\s+["']@uservane\/agent-react["']/);
  });

  it("client source tree does not import agent-core/server", () => {
    for (const rel of [
      "../src/index.ts",
      "../src/copilot-feedback.tsx",
      "../src/use-resolution.ts",
      "../src/resolution.ts",
    ]) {
      const src = readFileSync(join(__dirname, rel), "utf8");
      // Strip comments so doc examples do not false-positive (mirror openai-agents).
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, rel).not.toMatch(/agent-core\/server/);
      expect(code, rel).not.toMatch(/mintFeedbackToken/);
      expect(code, rel).not.toMatch(/uv_sk_/);
      expect(code, rel).not.toMatch(/from\s+["'][^"']*server["']/);
    }
  });

  it("built dist/index.js (when present) has no secret-key mint surface", () => {
    let built: string;
    try {
      built = readFileSync(join(__dirname, "../dist/index.js"), "utf8");
    } catch {
      return;
    }
    expect(built).not.toMatch(/uv_sk_/);
    expect(built).not.toMatch(/\/v1\/sdk\/tokens/);
    expect(built).not.toMatch(/mintFeedbackToken/);
  });

  it("src/server.ts does not import react", () => {
    const src = readFileSync(join(__dirname, "../src/server.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/["']use client["']/);
  });
});
