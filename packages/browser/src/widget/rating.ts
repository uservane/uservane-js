/**
 * Rating scale: numeric (NPS 0-10, CSAT 1-5, CES 1-7) or option list (PMF).
 * Real radio group: roving tabindex, arrow-key nav, labelled ends.
 * Numbers are never color-coded by sentiment.
 * All event listeners are host-error-isolated.
 */

import { COPY } from "../copy.js";
import { guardedListener } from "../guard.js";

export type RatingOption = {
  value: number;
  label: string;
};

export type RatingGroupOptions = {
  /** Inclusive min for numeric scales. Default 0. */
  min?: number;
  /** Inclusive max for numeric scales. Default 10. */
  max?: number;
  /**
   * Discrete labeled options (PMF). When set, min/max and end labels are ignored
   * for rendering; values come from each option.
   */
  options?: readonly RatingOption[];
  lowLabel?: string;
  highLabel?: string;
  name: string;
  /** Accessible name for the radiogroup. */
  groupLabel?: string;
  onSelect: (value: number) => void;
  reducedMotion: boolean;
};

export type RatingGroup = {
  root: HTMLElement;
  setValue: (value: number | null) => void;
  getValue: () => number | null;
  collapse: (value: number) => void;
  focus: () => void;
  destroy: () => void;
};

function buildItems(opts: RatingGroupOptions): RatingOption[] {
  if (opts.options && opts.options.length > 0) {
    return opts.options.map((o) => ({ value: o.value, label: o.label }));
  }
  const min = opts.min ?? 0;
  const max = opts.max ?? 10;
  const items: RatingOption[] = [];
  for (let i = min; i <= max; i++) {
    items.push({ value: i, label: String(i) });
  }
  return items;
}

export function createRatingGroup(opts: RatingGroupOptions): RatingGroup {
  const items = buildItems(opts);
  const isOptions = Boolean(opts.options && opts.options.length > 0);
  const lastIndex = items.length - 1;

  const wrap = document.createElement("div");
  wrap.className = isOptions ? "scale-wrap scale-wrap-options" : "scale-wrap";

  const fieldset = document.createElement("div");
  fieldset.className = isOptions ? "scale scale-options" : "scale";
  fieldset.setAttribute("role", "radiogroup");
  fieldset.setAttribute("aria-label", opts.groupLabel ?? COPY.ratingGroupLabel);

  const buttons: HTMLButtonElement[] = [];
  let selected: number | null = null;
  let focusIndex = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = isOptions ? "rating rating-option" : "rating";
    btn.textContent = item.label;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");

    if (isOptions) {
      btn.setAttribute("aria-label", item.label);
    } else if (i === 0 && opts.lowLabel) {
      btn.setAttribute("aria-label", `${item.value}, ${opts.lowLabel}`);
    } else if (i === lastIndex && opts.highLabel) {
      btn.setAttribute("aria-label", `${item.value}, ${opts.highLabel}`);
    } else {
      btn.setAttribute("aria-label", String(item.value));
    }
    btn.tabIndex = i === 0 ? 0 : -1;
    btn.dataset.value = String(item.value);

    const value = item.value;
    const index = i;
    btn.addEventListener(
      "click",
      guardedListener("rating-click", () => {
        select(value);
        opts.onSelect(value);
      }),
    );

    btn.addEventListener(
      "keydown",
      guardedListener("rating-keydown", (e: KeyboardEvent) => {
        handleKey(e, index);
      }),
    );

    buttons.push(btn);
    fieldset.appendChild(btn);
  }

  wrap.appendChild(fieldset);

  if (!isOptions && (opts.lowLabel || opts.highLabel)) {
    const legend = document.createElement("div");
    legend.className = "scale-legend";
    // Visible only; AT gets anchors via aria-label on end radios.
    legend.setAttribute("aria-hidden", "true");
    const low = document.createElement("span");
    low.textContent = opts.lowLabel ?? "";
    const high = document.createElement("span");
    high.textContent = opts.highLabel ?? "";
    legend.append(low, high);
    wrap.appendChild(legend);
  }

  function setRoving(index: number): void {
    focusIndex = Math.max(0, Math.min(lastIndex, index));
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (!b) continue;
      b.tabIndex = i === focusIndex ? 0 : -1;
    }
  }

  function indexOfValue(value: number): number {
    const idx = items.findIndex((it) => it.value === value);
    return idx >= 0 ? idx : 0;
  }

  function select(value: number): void {
    selected = value;
    for (const b of buttons) {
      const v = Number(b.dataset.value);
      const on = v === value;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.classList.toggle("is-selected", on);
    }
    setRoving(indexOfValue(value));
  }

  function handleKey(e: KeyboardEvent, index: number): void {
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = index >= lastIndex ? 0 : index + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = index <= 0 ? lastIndex : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = lastIndex;
        break;
      case " ":
      case "Enter": {
        e.preventDefault();
        const item = items[index];
        if (!item) return;
        select(item.value);
        opts.onSelect(item.value);
        return;
      }
      default:
        return;
    }
    if (next === null) return;
    e.preventDefault();
    setRoving(next);
    buttons[next]?.focus();
  }

  function collapse(value: number): void {
    select(value);
    wrap.classList.add("is-collapsed");
  }

  return {
    root: wrap,
    setValue: (v) => {
      if (v === null) {
        selected = null;
        for (const b of buttons) {
          b.setAttribute("aria-checked", "false");
          b.classList.remove("is-selected");
        }
        setRoving(0);
        return;
      }
      select(v);
    },
    getValue: () => selected,
    collapse,
    focus: () => {
      const b = buttons[focusIndex] ?? buttons[0];
      b?.focus();
    },
    destroy: () => {
      wrap.remove();
    },
  };
}
