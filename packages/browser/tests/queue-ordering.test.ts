import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __getRuntimeForTests, __resetForTests, UserVane } from "../src/index.js";
import { createMockFetch, flush, makeBootstrap, shadowRoot } from "./helpers.js";

describe("queued + idempotent API / ordering", () => {
  let mock: ReturnType<typeof createMockFetch>;
  let idleFns: Array<() => void>;

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    idleFns = [];
    mock = createMockFetch(makeBootstrap());
    __resetForTests({
      fetchImpl: mock.fetchImpl,
      scheduleIdle: (fn) => {
        idleFns.push(fn);
        return () => {};
      },
      scheduleDelay: (fn, _ms) => {
        // auto triggers: run immediately in these tests when scheduled
        fn();
        return () => {};
      },
    });
  });

  afterEach(() => {
    __resetForTests();
    document.body.innerHTML = "";
    localStorage.clear();
  });

  async function runIdle(): Promise<void> {
    const fns = idleFns.splice(0);
    for (const fn of fns) fn();
    await flush(10);
  }

  it("identify + survey before init resolve still shows the survey once rules load", async () => {
    // SPA auth often resolves after mount: identify/trigger before bootstrap.
    UserVane.identify({ userId: "user_42", traits: { plan: "pro" } });
    UserVane.survey("nps-q1");
    UserVane.init({ key: "uv_pk_live_test", debug: false });

    // Nothing yet — idle not run.
    expect(shadowRoot()).toBeNull();

    await runIdle();
    await flush(20);

    const root = shadowRoot();
    expect(root).not.toBeNull();
    expect(root?.querySelector(".question")?.textContent).toContain("recommend");

    // Bootstrap was called with the identified user.
    const boot = mock.calls.find((c) => c.url.includes("bootstrap"));
    expect(boot).toBeDefined();
  });

  it("init is idempotent", async () => {
    UserVane.init({ key: "uv_pk_a" });
    UserVane.init({ key: "uv_pk_a" });
    await runIdle();
    // May re-bootstrap on second init but must not throw / double-mount.
    UserVane.identify({ userId: "u1" });
    UserVane.survey("nps-q1");
    await flush(20);
    const hosts = document.querySelectorAll("[data-uservane-root]");
    expect(hosts.length).toBeLessThanOrEqual(1);
  });

  it("identify is repeatable and merges traits", async () => {
    UserVane.init({ key: "uv_pk_live_test" });
    UserVane.identify({ userId: "u1", traits: { plan: "free" } });
    UserVane.identify({ userId: "u1", traits: { seat: 3 } });
    await runIdle();
    const state = __getRuntimeForTests().getState();
    expect(state.userId).toBe("u1");
    expect(state.traits).toEqual({ plan: "free", seat: 3 });
  });

  it("survey trigger before rules load is buffered once (no duplicates)", async () => {
    UserVane.init({ key: "uv_pk_live_test" });
    UserVane.identify({ userId: "u1" });
    UserVane.survey("nps-q1");
    UserVane.survey("nps-q1");
    UserVane.survey("nps-q1");
    const pending = __getRuntimeForTests().getState().pendingSurveys;
    expect(pending.filter((p) => p.slug === "nps-q1")).toHaveLength(1);
    await runIdle();
    await flush(20);
    expect(document.querySelectorAll("[data-uservane-root]").length).toBe(1);
  });
});
