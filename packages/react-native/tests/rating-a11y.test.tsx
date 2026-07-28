import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SurveyType } from "@uservane/browser";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RatingScale } from "../src/rating.js";

function Controlled({
  type,
  collapsed: initialCollapsed = false,
}: {
  type: SurveyType;
  collapsed?: boolean;
}): ReactNode {
  const [value, setValue] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <RatingScale
      type={type}
      value={value}
      collapsed={collapsed && value !== null}
      onSelect={(v) => {
        setValue(v);
        setCollapsed(true);
      }}
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("RatingScale accessibility and counts", () => {
  it("NPS renders 11 radios (0-10) with radiogroup role", () => {
    render(<Controlled type="nps" />);
    const group = screen.getByTestId("uv-radiogroup");
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(group.getAttribute("aria-label")).toMatch(/0 to 10/i);

    for (let i = 0; i <= 10; i++) {
      const btn = screen.getByTestId(`uv-rating-${i}`);
      expect(btn.getAttribute("role")).toBe("radio");
      expect(btn.getAttribute("aria-checked")).not.toBe("true");
    }
    expect(screen.getByTestId("uv-scale-nps")).toBeTruthy();
  });

  it("CSAT renders 5 radios (1-5)", () => {
    render(<Controlled type="csat" />);
    expect(screen.queryByTestId("uv-rating-0")).toBeNull();
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByTestId(`uv-rating-${i}`).getAttribute("role")).toBe("radio");
    }
    expect(screen.queryByTestId("uv-rating-6")).toBeNull();
    expect(screen.getByTestId("uv-radiogroup").getAttribute("aria-label")).toMatch(/1 to 5/i);
  });

  it("CES renders 7 radios (1-7)", () => {
    render(<Controlled type="ces" />);
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByTestId(`uv-rating-${i}`).getAttribute("role")).toBe("radio");
    }
    expect(screen.queryByTestId("uv-rating-8")).toBeNull();
    expect(screen.getByTestId("uv-radiogroup").getAttribute("aria-label")).toMatch(/1 to 7/i);
  });

  it("PMF renders 3 labeled option radios", () => {
    render(<Controlled type="pmf" />);
    const group = screen.getByTestId("uv-radiogroup");
    expect(group.getAttribute("role")).toBe("radiogroup");
    // PMF values: very=2, somewhat=1, not=0
    expect(screen.getByTestId("uv-rating-2").getAttribute("aria-label")).toMatch(
      /Very disappointed/i,
    );
    expect(screen.getByTestId("uv-rating-1").getAttribute("aria-label")).toMatch(
      /Somewhat disappointed/i,
    );
    expect(screen.getByTestId("uv-rating-0").getAttribute("aria-label")).toMatch(
      /Not disappointed/i,
    );
  });

  it("selection sets accessibilityState selected and collapses to one value", () => {
    render(<Controlled type="nps" />);
    fireEvent.click(screen.getByTestId("uv-rating-9"));
    const selected = screen.getByTestId("uv-rating-9");
    expect(selected.getAttribute("aria-checked")).toBe("true");
    expect(selected.getAttribute("data-selected")).toBe("true");
    // Collapsed: other scores gone.
    expect(screen.queryByTestId("uv-rating-0")).toBeNull();
    expect(screen.queryByTestId("uv-rating-5")).toBeNull();
  });

  it("end labels appear on numeric scales (one-question context)", () => {
    render(<Controlled type="nps" />);
    expect(screen.getByText("Not at all likely")).toBeTruthy();
    expect(screen.getByText("Extremely likely")).toBeTruthy();
  });
});
