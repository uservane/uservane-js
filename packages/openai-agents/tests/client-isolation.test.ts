/**
 * Client entry must never expose or import the secret-key / server mint path.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("client entry isolation", () => {
  it("src/index.ts does not import server mint, secret key paths, or langfuse bridge", () => {
    const src = readFileSync(join(__dirname, "../src/index.ts"), "utf8");
    // Strip block comments so doc examples do not false-positive.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bmintFeedbackToken\b/);
    expect(code).not.toMatch(/\brunWithFeedback\b/);
    expect(code).not.toMatch(/uv_sk_/);
    expect(code).not.toMatch(/\bsecretKey\b/);
    expect(code).not.toMatch(/from\s+["'][^"']*server["']/);
    expect(code).not.toMatch(/from\s+["'][^"']*langfuse["']/);
    expect(code).not.toMatch(/USERVANE_SECRET/);
    // Only re-exports from agent-core + agent-react.
    expect(code).toMatch(/from\s+["']@uservane\/agent-core["']/);
    expect(code).toMatch(/from\s+["']@uservane\/agent-react["']/);
  });

  it("built dist/index.js (when present) has no secret-key mint surface", () => {
    let built: string;
    try {
      built = readFileSync(join(__dirname, "../dist/index.js"), "utf8");
    } catch {
      return;
    }
    // Bundled re-exports only; must not embed mint or secret key literals.
    expect(built).not.toMatch(/uv_sk_/);
    expect(built).not.toMatch(/\/v1\/sdk\/tokens/);
    expect(built).not.toMatch(/mintFeedbackToken/);
  });

  it("src/server.ts does not import react", () => {
    const src = readFileSync(join(__dirname, "../src/server.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/["']use client["']/);
  });

  it("src/langfuse.ts does not import react or ship keys to UserVane", () => {
    const src = readFileSync(join(__dirname, "../src/langfuse.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']react["']/);
    expect(src).not.toMatch(/api\.uservane\.com/);
    expect(src).not.toMatch(/["']use client["']/);
  });
});
