/**
 * @vitest-environment node
 *
 * SSR-safe: importing with no window/document must not throw.
 * Uses the node environment so `window` is undefined at import time.
 */
import { describe, expect, it } from "vitest";

describe("SSR-safe import", () => {
  it("has no window in this environment", () => {
    expect(typeof globalThis.window).toBe("undefined");
  });

  it("importing the package module does not throw without window", async () => {
    const mod = await import("../src/index.js");
    expect(mod.UserVaneProvider).toBeTypeOf("function");
    expect(mod.useUserVane).toBeTypeOf("function");
  });
});
