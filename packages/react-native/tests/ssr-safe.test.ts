/**
 * @vitest-environment node
 *
 * Native/SSR-safe: importing with no window/document must not throw.
 */
import { describe, expect, it } from "vitest";

describe("native-safe import", () => {
  it("has no window in this environment", () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
  });

  it("importing the package module does not throw without window", async () => {
    const mod = await import("../src/index.js");
    expect(mod.UserVaneProvider).toBeTypeOf("function");
    expect(mod.useUserVane).toBeTypeOf("function");
    expect(mod.SurveyCard).toBeTypeOf("function");
    expect(mod.NativeController).toBeTypeOf("function");
  });
});
