import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetForTests, UserVane } from "../src/index.js";
import {
  activeHost,
  createMockFetch,
  flush,
  makeBootstrap,
  makeSurvey,
  shadowRoot,
} from "./helpers.js";

describe("suppression / never re-prompt", () => {
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
    localStorage.clear();
  });

  async function bootAndShow(): Promise<void> {
    UserVane.init({ key: "uv_pk_test" });
    UserVane.identify({ userId: "u1" });
    UserVane.survey("nps-q1");
    for (const fn of idleFns.splice(0)) fn();
    await flush(30);
  }

  it("answered survey is never shown again (server suppression)", async () => {
    const survey = makeSurvey();
    mock.setBootstrap(
      makeBootstrap({
        surveys: [survey],
        suppression: [survey.id],
        showTokens: { [survey.id]: "tok_x" },
      }),
    );
    await bootAndShow();
    expect(shadowRoot()).toBeNull();
    expect(activeHost()).toBeNull();
  });

  it("answered survey is never shown again after local complete", async () => {
    await bootAndShow();
    expect(shadowRoot()).not.toBeNull();

    // Select a promoter rating (auto-submits without follow-up path if no follow-up wait)
    // Our survey has follow-up, so pick 9 and skip.
    const root = shadowRoot();
    const btn = root?.querySelector<HTMLButtonElement>('.rating[data-value="9"]');
    expect(btn).toBeTruthy();
    btn?.click();
    await flush(50);

    // Skip follow-up
    const skip = shadowRoot()?.querySelector<HTMLButtonElement>(".btn-ghost");
    skip?.click();
    await flush(50);

    // Destroy active and try again
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
    // localStorage still has suppression
    await bootAndShow();
    // Should not re-prompt
    expect(shadowRoot()).toBeNull();
  });

  it("mutation: clearing sessionShown alone cannot re-prompt if local suppression holds", async () => {
    const survey = makeSurvey();
    // First show + dismiss
    await bootAndShow();
    expect(shadowRoot()).not.toBeNull();
    const dismiss = shadowRoot()?.querySelector<HTMLButtonElement>(".dismiss");
    dismiss?.click();
    await flush(200);

    // New runtime, same localStorage — still suppressed.
    idleFns = [];
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
    mock.setBootstrap(
      makeBootstrap({
        surveys: [survey],
        suppression: [], // server empty — client local still blocks
        showTokens: { [survey.id]: "tok_new" },
      }),
    );
    await bootAndShow();
    expect(shadowRoot()).toBeNull();
  });
});
