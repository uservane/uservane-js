/**
 * The mount element must be invisible to the host page's CSS.
 *
 * The shadow root protects what is inside the widget. It does nothing for the
 * element the shadow is attached to, which lives in the host page's light DOM
 * and is therefore matched by the host's own selectors. A site with a global
 * rule like `div { border: 2px dashed; padding: 9px }` painted that element as
 * a stray empty box in the page flow, on their site, above their content.
 *
 * Found by mounting the real widget on a deliberately hostile page in a real
 * browser. Nothing in this suite could see it: a mocked DOM has no cascade and
 * no layout, so the element was correct in structure and wrong on screen.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mountWidget } from "../src/widget/widget.js";
import { makeSurvey } from "./helpers.js";

const noopCallbacks = {
  onSubmit: () => {},
  onDismiss: () => {},
  onFollowUp: () => {},
} as unknown as Parameters<typeof mountWidget>[1];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the widget's mount element cannot be styled by the host page", () => {
  it("generates no box, so a host rule has nothing to paint", () => {
    const handle = mountWidget(makeSurvey({ slug: "iso" }), noopCallbacks);
    const host = handle?.getHost() ?? document.querySelector("[data-uservane-root]");
    expect(host, "the widget did not mount").not.toBeNull();

    const style = (host as HTMLElement).style;
    // display:contents removes the element from layout entirely, so border,
    // padding, background and margin from the host page have nowhere to apply.
    expect(style.display, "the mount element still generates a paintable box").toBe("contents");
    // Priority matters: the whole point is to beat whatever the host declares.
    expect(
      style.getPropertyPriority("display"),
      "a host rule can override this and bring the box back",
    ).toBe("important");
  });

  it("still passes font inheritance through to the shadow content", () => {
    const handle = mountWidget(makeSurvey({ slug: "iso2" }), noopCallbacks);
    const host = (handle?.getHost() ??
      document.querySelector("[data-uservane-root]")) as HTMLElement;
    // The widget deliberately inherits the host's font so it reads as native.
    // Inheritance still flows through an element that generates no box, and
    // this pins that the reset did not cost us that.
    expect(host.style.fontFamily).toBe("inherit");
  });
});
