import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetForTests, UserVane } from "../src/index.js";
import { createMockFetch, flush, makeBootstrap } from "./helpers.js";

describe("network failure renders nothing", () => {
  let mock: ReturnType<typeof createMockFetch>;
  let idleFns: Array<() => void>;

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    idleFns = [];
    mock = createMockFetch();
    __resetForTests({
      fetchImpl: mock.fetchImpl,
      scheduleIdle: (fn) => {
        idleFns.push(fn);
        return () => {};
      },
      scheduleDelay: (fn) => {
        fn();
        return () => {};
      },
    });
  });

  afterEach(() => {
    __resetForTests();
    document.body.innerHTML = "";
  });

  it("bootstrap network error => no DOM partial", async () => {
    mock.setBootstrapError();
    UserVane.init({ key: "uv_pk_test" });
    UserVane.identify({ userId: "u1" });
    UserVane.survey("nps-q1");
    for (const fn of idleFns.splice(0)) fn();
    await flush(30);

    expect(document.querySelector("[data-uservane-root]")).toBeNull();
    expect(document.querySelectorAll("[class*='uv']").length).toBe(0);
    // No role=dialog from us
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("bootstrap 500 => no widget", async () => {
    mock.setBootstrap(null, 500);
    UserVane.init({ key: "uv_pk_test" });
    UserVane.identify({ userId: "u1" });
    UserVane.survey("nps-q1");
    for (const fn of idleFns.splice(0)) fn();
    await flush(30);
    expect(document.querySelector("[data-uservane-root]")).toBeNull();
  });

  it("stale-serve after failed re-fetch still mounts a complete widget (never partial)", async () => {
    mock.setBootstrap(makeBootstrap());
    UserVane.init({ key: "uv_pk_test" });
    UserVane.identify({ userId: "u1" });
    for (const fn of idleFns.splice(0)) fn();
    await flush(20);

    // Force re-identify which re-bootstraps; make it fail.
    mock.setBootstrapError();
    UserVane.identify({ userId: "u1", traits: { plan: "pro" } });
    await flush(30);

    // Stale-serve allows a trigger still - full widget or nothing, never half.
    UserVane.survey("nps-q1");
    await flush(30);
    const host = document.querySelector("[data-uservane-root]");
    // No tautological if-guard: assert the complete structure directly.
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.querySelector(".question")).toBeTruthy();
    expect(host?.shadowRoot?.querySelectorAll(".rating").length).toBe(11);
  });
});
