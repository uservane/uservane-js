import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COPY } from "../src/copy.js";
import { scaleForType } from "../src/scale.js";
import { createRatingGroup } from "../src/widget/rating.js";
import { mountWidget } from "../src/widget/widget.js";
import { makeSurvey, ratingButtons, shadowRoot } from "./helpers.js";

describe("multi-type rating scales", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("CSAT renders 1-5 radios with end labels and a11y", () => {
    const scale = scaleForType("csat");
    const group = createRatingGroup({
      min: scale.min,
      max: scale.max,
      lowLabel: COPY.csatLow,
      highLabel: COPY.csatHigh,
      groupLabel: scale.groupLabel,
      name: "csat",
      reducedMotion: true,
      onSelect: () => {},
    });
    document.body.appendChild(group.root);
    const radios = group.root.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(5);
    expect(radios[0]?.getAttribute("aria-label")).toMatch(/^1,/);
    expect(radios[0]?.getAttribute("aria-label")).toContain(COPY.csatLow);
    expect(radios[4]?.getAttribute("aria-label")).toMatch(/^5,/);
    expect(group.root.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe(
      scale.groupLabel,
    );
  });

  it("CES renders 1-7 radios", () => {
    const scale = scaleForType("ces");
    const group = createRatingGroup({
      min: scale.min,
      max: scale.max,
      lowLabel: COPY.cesLow,
      highLabel: COPY.cesHigh,
      groupLabel: scale.groupLabel,
      name: "ces",
      reducedMotion: true,
      onSelect: () => {},
    });
    document.body.appendChild(group.root);
    expect(group.root.querySelectorAll('[role="radio"]').length).toBe(7);
  });

  it("PMF renders 3 labeled options with keyboard a11y", () => {
    const scale = scaleForType("pmf");
    let selected: number | null = null;
    const group = createRatingGroup({
      options: scale.options?.map((o) => ({ value: o.value, label: o.label })),
      groupLabel: scale.groupLabel,
      name: "pmf",
      reducedMotion: true,
      onSelect: (v) => {
        selected = v;
      },
    });
    document.body.appendChild(group.root);
    const radios = [...group.root.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.length).toBe(3);
    expect(radios[0]?.textContent).toBe(COPY.pmfVery);
    expect(radios[1]?.textContent).toBe(COPY.pmfSomewhat);
    expect(radios[2]?.textContent).toBe(COPY.pmfNot);
    // No numeric legend for PMF
    expect(group.root.querySelector(".scale-legend")).toBeNull();

    radios[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(selected).toBe(2);
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true");

    radios[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(radios.filter((r) => r.tabIndex === 0)[0]?.textContent).toBe(COPY.pmfSomewhat);
  });

  it("widget mounts CSAT with 5 buttons", () => {
    const handle = mountWidget(
      makeSurvey({
        type: "csat",
        question: "How satisfied are you?",
        endLabels: { low: COPY.csatLow, high: COPY.csatHigh },
      }),
      { onComplete: () => {}, onDismiss: () => {} },
      { moveFocus: true },
    );
    expect(handle).not.toBeNull();
    expect(ratingButtons().length).toBe(5);
    const rg = shadowRoot()?.querySelector('[role="radiogroup"]');
    expect(rg?.getAttribute("aria-label")).toContain("1 to 5");
  });

  it("widget mounts CES with 7 buttons", () => {
    const handle = mountWidget(makeSurvey({ type: "ces", question: "How easy was it?" }), {
      onComplete: () => {},
      onDismiss: () => {},
    });
    expect(handle).not.toBeNull();
    expect(ratingButtons().length).toBe(7);
  });

  it("widget mounts PMF with 3 option buttons", () => {
    const handle = mountWidget(
      makeSurvey({
        type: "pmf",
        question: "How would you feel if you could no longer use our product?",
      }),
      { onComplete: () => {}, onDismiss: () => {} },
    );
    expect(handle).not.toBeNull();
    const buttons = ratingButtons();
    expect(buttons.length).toBe(3);
    expect(buttons.map((b) => b.textContent)).toEqual([
      COPY.pmfVery,
      COPY.pmfSomewhat,
      COPY.pmfNot,
    ]);
  });

  it("NPS still renders 11 radios (regression)", () => {
    const handle = mountWidget(makeSurvey({ type: "nps" }), {
      onComplete: () => {},
      onDismiss: () => {},
    });
    expect(handle).not.toBeNull();
    expect(ratingButtons().length).toBe(11);
  });

  it("numbers are never sentiment-colored on CSAT", () => {
    const scale = scaleForType("csat");
    const group = createRatingGroup({
      min: scale.min,
      max: scale.max,
      name: "csat2",
      reducedMotion: true,
      onSelect: () => {},
    });
    document.body.appendChild(group.root);
    for (const r of group.root.querySelectorAll(".rating")) {
      expect(r.className).not.toMatch(/detractor|passive|promoter|red|green|sentiment/i);
    }
  });
});
