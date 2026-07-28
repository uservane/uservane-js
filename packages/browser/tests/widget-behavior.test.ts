import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../src/copy.js";
import { __resetForTests, UserVane } from "../src/index.js";
import {
  createMockFetch,
  flush,
  makeBootstrap,
  makeSurvey,
  ratingButtons,
  shadowRoot,
} from "./helpers.js";

describe("widget behavior", () => {
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
    vi.restoreAllMocks();
  });

  async function show(surveyOverrides = {}): Promise<void> {
    const survey = makeSurvey(surveyOverrides);
    mock.setBootstrap(
      makeBootstrap({
        surveys: [survey],
        showTokens: { [survey.id]: "tok_show_1" },
      }),
    );
    UserVane.init({ key: "uv_pk_test" });
    UserVane.identify({ userId: "u1" });
    UserVane.survey(survey.slug);
    for (const fn of idleFns.splice(0)) fn();
    await flush(30);
  }

  it("dialog is role=dialog aria-modal=false", async () => {
    await show();
    const dialog = shadowRoot()?.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-modal")).toBe("false");
  });

  it("detractor score offers follow-up contact choice", async () => {
    await show({ followUpQuestion: undefined });
    const btn = ratingButtons().find((b) => b.dataset.value === "3");
    btn?.click();
    await flush(50);
    const root = shadowRoot();
    expect(root?.textContent).toContain(COPY.followUpOffer);
    expect(root?.textContent).toContain(COPY.followUpYes);
  });

  it("promoter without follow-up question submits and shows thanks", async () => {
    await show({ followUpQuestion: undefined });
    const btn = ratingButtons().find((b) => b.dataset.value === "10");
    btn?.click();
    await flush(50);
    expect(shadowRoot()?.textContent).toContain(COPY.thanks);
    await flush(20);
    expect(mock.submittedBodies.length).toBeGreaterThanOrEqual(1);
    const body = mock.submittedBodies[0] as { showToken: string; rating: number };
    expect(body.showToken).toBe("tok_show_1");
    expect(body.rating).toBe(10);
  });

  it("scale collapses on selection (is-collapsed class)", async () => {
    await show();
    const btn = ratingButtons().find((b) => b.dataset.value === "8");
    btn?.click();
    await flush(20);
    expect(shadowRoot()?.querySelector(".scale-wrap")?.classList.contains("is-collapsed")).toBe(
      true,
    );
  });

  it("submits show-token from definitions response (never invents one)", async () => {
    await show({ followUpQuestion: undefined });
    ratingButtons()
      .find((b) => b.dataset.value === "9")
      ?.click();
    await flush(30);
    const body = mock.submittedBodies[0] as { showToken: string };
    expect(body.showToken).toBe("tok_show_1");
    expect(body.showToken).not.toMatch(/^client-/);
  });

  it("inline mode reserves full card height on host slot (zero CLS)", async () => {
    const slot = document.createElement("div");
    slot.setAttribute("data-uservane", "nps-q1");
    document.body.appendChild(slot);
    await show({ presentation: "inline", followUpQuestion: undefined });
    // Must be large enough for question + wrapped scale + legend + follow-up.
    expect(Number.parseInt(slot.style.minHeight, 10)).toBeGreaterThanOrEqual(300);
    expect(slot.querySelector("[data-uservane-root]")).toBeTruthy();
  });

  it("inline with no slot renders nothing (no body fallback)", async () => {
    // No [data-uservane] in the document.
    await show({ presentation: "inline", followUpQuestion: undefined });
    expect(document.querySelector("[data-uservane-root]")).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("explicit survey() moves focus into the rating group", async () => {
    await show({ followUpQuestion: undefined });
    await flush(20);
    const active = document.activeElement;
    // Focus is inside the shadow tree on a rating radio.
    const host = document.querySelector("[data-uservane-root]");
    expect(host?.shadowRoot?.activeElement?.getAttribute("role")).toBe("radio");
    expect(active).toBe(host);
  });

  it("auto appearance does not steal focus", async () => {
    const survey = makeSurvey({
      trigger: "auto",
      delayMs: 0,
      followUpQuestion: undefined,
    });
    mock.setBootstrap(
      makeBootstrap({
        surveys: [survey],
        showTokens: { [survey.id]: "tok_auto" },
      }),
    );
    // Focus something on the host page first.
    const hostBtn = document.createElement("button");
    hostBtn.id = "host-focus";
    hostBtn.textContent = "host";
    document.body.appendChild(hostBtn);
    hostBtn.focus();
    expect(document.activeElement).toBe(hostBtn);

    UserVane.init({ key: "uv_pk_test" });
    UserVane.identify({ userId: "u1" });
    // No survey() - auto only.
    for (const fn of idleFns.splice(0)) fn();
    await flush(40);

    // Widget may be present, but host focus must stay put.
    expect(document.activeElement).toBe(hostBtn);
  });

  it("ESC dismisses without submit", async () => {
    await show();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush(200);
    expect(document.querySelector("[data-uservane-root]")).toBeNull();
    expect(mock.submittedBodies).toHaveLength(0);
  });
});
