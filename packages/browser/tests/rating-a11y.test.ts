import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COPY } from "../src/copy.js";
import { createRatingGroup } from "../src/widget/rating.js";

describe("rating radio group keyboard nav + roving tabindex", () => {
  let root: HTMLElement;
  let selected: number | null;

  beforeEach(() => {
    document.body.innerHTML = "";
    selected = null;
    const group = createRatingGroup({
      lowLabel: COPY.npsLow,
      highLabel: COPY.npsHigh,
      name: "test",
      reducedMotion: true,
      onSelect: (v) => {
        selected = v;
      },
    });
    root = group.root;
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("exposes radiogroup with 11 radios", () => {
    const rg = root.querySelector('[role="radiogroup"]');
    expect(rg).toBeTruthy();
    const radios = root.querySelectorAll('[role="radio"]');
    expect(radios.length).toBe(11);
  });

  it("has roving tabindex: only one tabbable at a time", () => {
    const radios = [...root.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const tabbable = radios.filter((r) => r.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]?.textContent).toBe("0");
  });

  it("arrow keys move focus and update roving tabindex", () => {
    const radios = [...root.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const first = radios[0];
    expect(first).toBeTruthy();
    first?.focus();
    first?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const tabbable = radios.filter((r) => r.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]?.textContent).toBe("1");
  });

  it("Home/End jump to ends", () => {
    const radios = [...root.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    radios[5]?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(radios.filter((r) => r.tabIndex === 0)[0]?.textContent).toBe("10");
    radios[10]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(radios.filter((r) => r.tabIndex === 0)[0]?.textContent).toBe("0");
  });

  it("Space/Enter selects", () => {
    const radios = [...root.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    radios[7]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(selected).toBe(7);
    expect(radios[7]?.getAttribute("aria-checked")).toBe("true");
  });

  it("numbers are not pre-colored by sentiment classes", () => {
    const radios = [...root.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    for (const r of radios) {
      expect(r.className).not.toMatch(/detractor|passive|promoter|red|green|sentiment/i);
      // Only base class until selected
      expect(r.classList.contains("rating")).toBe(true);
    }
  });

  it("end labels present, not mid labels for every number", () => {
    const legend = root.querySelector(".scale-legend");
    expect(legend?.textContent).toContain(COPY.npsLow);
    expect(legend?.textContent).toContain(COPY.npsHigh);
  });

  it("end labels are exposed to AT on the 0 and 10 radios", () => {
    const radios = [...root.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const zero = radios.find((r) => r.dataset.value === "0");
    const ten = radios.find((r) => r.dataset.value === "10");
    const mid = radios.find((r) => r.dataset.value === "5");
    expect(zero?.getAttribute("aria-label")).toContain(COPY.npsLow);
    expect(zero?.getAttribute("aria-label")).toMatch(/^0,/);
    expect(ten?.getAttribute("aria-label")).toContain(COPY.npsHigh);
    expect(ten?.getAttribute("aria-label")).toMatch(/^10,/);
    // Mid values stay numeric only.
    expect(mid?.getAttribute("aria-label")).toBe("5");
    // Visible legend remains for sighted users.
    expect(root.querySelector(".scale-legend")?.getAttribute("aria-hidden")).toBe("true");
  });
});
