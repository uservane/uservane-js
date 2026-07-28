import { describe, expect, it, vi } from "vitest";
import { __forceThrowForTests, __resetForTests, UserVane } from "../src/index.js";

describe("errors never propagate to the host", () => {
  it("internal throw is swallowed; host callback still runs", () => {
    __resetForTests();
    const hostCallback = vi.fn();
    expect(() => {
      __forceThrowForTests();
      hostCallback();
    }).not.toThrow();
    expect(hostCallback).toHaveBeenCalledOnce();
  });

  it("init with invalid options does not throw", () => {
    __resetForTests();
    expect(() => UserVane.init({ key: "" })).not.toThrow();
    // @ts-expect-error intentional bad input
    expect(() => UserVane.init(null)).not.toThrow();
  });

  it("identify with invalid options does not throw", () => {
    __resetForTests();
    // @ts-expect-error intentional bad input
    expect(() => UserVane.identify({})).not.toThrow();
    // @ts-expect-error intentional bad input
    expect(() => UserVane.identify(null)).not.toThrow();
  });

  it("survey with invalid slug does not throw", () => {
    __resetForTests();
    // @ts-expect-error intentional bad input
    expect(() => UserVane.survey(null)).not.toThrow();
    expect(() => UserVane.survey("")).not.toThrow();
  });
});
