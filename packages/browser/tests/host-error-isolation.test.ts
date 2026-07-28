/**
 * CRITICAL: errors on async continuations must never reach the host.
 * These tests install window.onunhandledrejection / onerror spies and force
 * throws on each deferred path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../src/copy.js";
import { __resetForTests, UserVane } from "../src/index.js";
import { createRatingGroup } from "../src/widget/rating.js";
import { createMockFetch, flush, makeBootstrap, makeSurvey } from "./helpers.js";

type EscapeSpy = {
  rejections: unknown[];
  errors: unknown[];
  hostContinued: boolean;
};

function installEscapeSpies(): EscapeSpy {
  const state: EscapeSpy = { rejections: [], errors: [], hostContinued: false };

  window.addEventListener("unhandledrejection", (e) => {
    state.rejections.push(e.reason);
    e.preventDefault();
  });

  window.onerror = (message) => {
    state.errors.push(message);
    return true; // suppress default
  };

  return state;
}

function expectNoHostEscape(spy: EscapeSpy): void {
  expect(spy.rejections, "unhandledrejection reached host").toEqual([]);
  expect(spy.errors, "window.onerror reached host").toEqual([]);
  expect(spy.hostContinued).toBe(true);
}

describe("host error isolation (async paths)", () => {
  let idleFns: Array<() => void>;
  let mock: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    idleFns = [];
    mock = createMockFetch();
  });

  afterEach(() => {
    __resetForTests();
    document.body.innerHTML = "";
    localStorage.clear();
    window.onerror = null;
    vi.restoreAllMocks();
  });

  it("(a) init with malformed apiBase does not escape to host", async () => {
    const spy = installEscapeSpies();
    __resetForTests({
      fetchImpl: mock.fetchImpl,
      scheduleIdle: (fn) => {
        idleFns.push(fn);
        return () => {};
      },
    });

    expect(() => {
      UserVane.init({ key: "uv_pk_test", apiBase: "not-a-url" });
      UserVane.identify({ userId: "u1" });
      UserVane.survey("nps-q1");
    }).not.toThrow();

    for (const fn of idleFns.splice(0)) fn();
    await flush(40);

    spy.hostContinued = true;
    // Host keeps running; no widget (fail closed).
    expect(document.querySelector("[data-uservane-root]")).toBeNull();
    expectNoHostEscape(spy);
  });

  it("(b) bootstrap that rejects does not escape to host", async () => {
    const spy = installEscapeSpies();
    mock.setBootstrapError();
    __resetForTests({
      fetchImpl: mock.fetchImpl,
      scheduleIdle: (fn) => {
        idleFns.push(fn);
        return () => {};
      },
    });

    UserVane.init({ key: "uv_pk_test" });
    UserVane.identify({ userId: "u1" });
    UserVane.survey("nps-q1");
    for (const fn of idleFns.splice(0)) fn();
    await flush(40);

    spy.hostContinued = true;
    expect(document.querySelector("[data-uservane-root]")).toBeNull();
    expectNoHostEscape(spy);
  });

  it("(c) auto timer whose mount throws does not escape to host", async () => {
    const spy = installEscapeSpies();
    const survey = makeSurvey({ trigger: "auto", delayMs: 0 });
    mock.setBootstrap(
      makeBootstrap({
        surveys: [survey],
        showTokens: { [survey.id]: "tok_auto" },
      }),
    );

    __resetForTests({
      fetchImpl: mock.fetchImpl,
      scheduleIdle: (fn) => {
        idleFns.push(fn);
        return () => {};
      },
      scheduleDelay: (fn) => {
        // Defer so the timer body is NOT inside afterRules's stack.
        // Mutation-sensitive: without guard("auto-show"), the throw escapes.
        const id = setTimeout(fn, 0);
        return () => clearTimeout(id);
      },
      testHooks: {
        beforeAutoShow: () => {
          throw new Error("intentional auto-show throw");
        },
      },
    });

    UserVane.init({ key: "uv_pk_test" });
    UserVane.identify({ userId: "u1" });
    // No explicit survey() - auto path only.
    for (const fn of idleFns.splice(0)) fn();
    await flush(50);

    spy.hostContinued = true;
    expect(document.querySelector("[data-uservane-root]")).toBeNull();
    expectNoHostEscape(spy);
  });

  it("(c2) tryShowSurvey / mount throw does not escape", async () => {
    const spy = installEscapeSpies();
    const survey = makeSurvey({ trigger: "manual" });
    mock.setBootstrap(
      makeBootstrap({
        surveys: [survey],
        showTokens: { [survey.id]: "tok" },
      }),
    );

    __resetForTests({
      fetchImpl: mock.fetchImpl,
      scheduleIdle: (fn) => {
        idleFns.push(fn);
        return () => {};
      },
      testHooks: {
        beforeMount: () => {
          throw new Error("intentional mount throw");
        },
      },
    });

    UserVane.init({ key: "uv_pk_test" });
    UserVane.identify({ userId: "u1" });
    UserVane.survey(survey.slug);
    for (const fn of idleFns.splice(0)) fn();
    await flush(40);

    spy.hostContinued = true;
    expectNoHostEscape(spy);
  });

  it("(d) widget event listener whose handler throws does not escape", () => {
    const spy = installEscapeSpies();
    const group = createRatingGroup({
      lowLabel: COPY.npsLow,
      highLabel: COPY.npsHigh,
      name: "throw-test",
      reducedMotion: true,
      onSelect: () => {
        throw new Error("intentional rating onSelect throw");
      },
    });
    document.body.appendChild(group.root);

    const btn = group.root.querySelector<HTMLButtonElement>('.rating[data-value="5"]');
    expect(btn).toBeTruthy();
    expect(() => btn?.click()).not.toThrow();

    spy.hostContinued = true;
    expectNoHostEscape(spy);
  });

  it("(d2) rating keydown handler throw does not escape", () => {
    const spy = installEscapeSpies();
    const group = createRatingGroup({
      lowLabel: COPY.npsLow,
      highLabel: COPY.npsHigh,
      name: "throw-key",
      reducedMotion: true,
      onSelect: () => {
        throw new Error("intentional key select throw");
      },
    });
    document.body.appendChild(group.root);
    const btn = group.root.querySelector<HTMLButtonElement>('.rating[data-value="3"]');
    expect(() => {
      btn?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }).not.toThrow();

    spy.hostContinued = true;
    expectNoHostEscape(spy);
  });

  it("submitResponse path throw does not escape", async () => {
    const spy = installEscapeSpies();
    const survey = makeSurvey({ followUpQuestion: undefined });
    mock.setBootstrap(
      makeBootstrap({
        surveys: [survey],
        showTokens: { [survey.id]: "tok_sub" },
      }),
    );

    __resetForTests({
      fetchImpl: mock.fetchImpl,
      scheduleIdle: (fn) => {
        idleFns.push(fn);
        return () => {};
      },
      testHooks: {
        beforeSubmit: () => {
          throw new Error("intentional submit throw");
        },
      },
    });

    UserVane.init({ key: "uv_pk_test" });
    UserVane.identify({ userId: "u1" });
    UserVane.survey(survey.slug);
    for (const fn of idleFns.splice(0)) fn();
    await flush(30);

    const btn = document
      .querySelector("[data-uservane-root]")
      ?.shadowRoot?.querySelector<HTMLButtonElement>('.rating[data-value="10"]');
    btn?.click();
    await flush(40);

    spy.hostContinued = true;
    expectNoHostEscape(spy);
  });
});
