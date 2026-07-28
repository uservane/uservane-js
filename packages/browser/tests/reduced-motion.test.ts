import { describe, expect, it } from "vitest";
import { WIDGET_CSS } from "../src/widget/styles.js";

describe("prefers-reduced-motion", () => {
  it("CSS includes reduced-motion overrides that zero transitions", () => {
    expect(WIDGET_CSS).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(WIDGET_CSS).toMatch(/transition:\s*none\s*!important/);
  });
});
