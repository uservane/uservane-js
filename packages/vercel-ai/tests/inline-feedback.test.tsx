import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentController } from "../src/controller.js";
import { UserVaneErrorBoundary } from "../src/error-boundary.js";
import { InlineFeedback } from "../src/inline-feedback.js";
import { createMockFetch, flush, makeBootstrap, makeSurvey } from "./helpers.js";

function Boom(): ReactNode {
  throw new Error("intentional inline render throw");
}

describe("InlineFeedback", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("reserves 0-CLS space even when no ask is active", () => {
    const c = new AgentController();
    render(<InlineFeedback controller={c} />);
    const slot = screen.getByTestId("uv-inline-feedback");
    expect(slot).toBeTruthy();
    expect(slot.getAttribute("data-active")).toBe("false");
    expect((slot as HTMLElement).style.minHeight).toBe("48px");
  });

  it("renders the active ask and dismisses on next outside action", async () => {
    const survey = makeSurvey({ followUpQuestion: undefined });
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_ui" } }),
    );
    const c = new AgentController({ fetchImpl: mock.fetchImpl });
    c.init({ key: "uv_pk_ui", surveySlug: "nps-q1", nonBlocking: true });
    c.identify({ userId: "u_ui" });
    await flush(20);
    c.resolveTask();
    await flush(10);

    render(
      <div>
        <button type="button" data-testid="outside">
          outside
        </button>
        <InlineFeedback controller={c} />
      </div>,
    );

    expect(screen.getByTestId("uv-inline-ask")).toBeTruthy();
    expect(screen.getByTestId("uv-inline-question").textContent).toBe(survey.question);

    // Allow dismiss-on-next-action arming (setTimeout 0).
    await flush(20);
    fireEvent.pointerDown(screen.getByTestId("outside"));
    await flush(10);

    expect(c.getActive()).toBeNull();
    expect(screen.queryByTestId("uv-inline-ask")).toBeNull();
  });

  it("error boundary swallows a throw inside the inline tree", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = new AgentController();

    expect(() => {
      render(
        <div data-testid="host">
          <span data-testid="host-sibling">host-ok</span>
          <UserVaneErrorBoundary debug>
            <div data-testid="uv-child">
              <Boom />
            </div>
            <InlineFeedback controller={c} />
          </UserVaneErrorBoundary>
        </div>,
      );
    }).not.toThrow();

    expect(screen.getByTestId("host")).toBeTruthy();
    expect(screen.getByTestId("host-sibling").textContent).toBe("host-ok");
    expect(screen.queryByTestId("uv-child")).toBeNull();

    consoleSpy.mockRestore();
  });
});
