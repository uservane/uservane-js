import { describe, expect, it } from "vitest";

/**
 * SSR-safe: importing with no window/document must not throw.
 * happy-dom provides a document in the normal suite; this test isolates
 * the pure modules and the public API shape without mounting.
 */
describe("SSR-safe import", () => {
  it("importing the package module does not throw", async () => {
    // Dynamic import of the source entry — evaluation must not touch window.
    const mod = await import("../src/index.js");
    expect(mod.UserVane).toBeDefined();
    expect(typeof mod.UserVane.init).toBe("function");
    expect(typeof mod.UserVane.identify).toBe("function");
    expect(typeof mod.UserVane.survey).toBe("function");
  });

  it("init/identify/survey are callable without throwing when document exists", async () => {
    const { UserVane, __resetForTests } = await import("../src/index.js");
    __resetForTests({
      scheduleIdle: (fn) => {
        // never run
        void fn;
        return () => {};
      },
      fetchImpl: async () => new Response("{}", { status: 500 }),
    });
    expect(() => UserVane.init({ key: "uv_pk_test" })).not.toThrow();
    expect(() => UserVane.identify({ userId: "u1" })).not.toThrow();
    expect(() => UserVane.survey("nps")).not.toThrow();
    __resetForTests();
  });
});
