import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { COPY } from "@uservane/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SurveyCard } from "../src/survey-card.js";
import { makeSurvey } from "./helpers.js";

afterEach(() => {
  cleanup();
});

describe("SurveyCard", () => {
  it("renders one question and optional follow-up is secondary (hidden until rating)", () => {
    const survey = makeSurvey({
      question: "How likely are you to recommend us?",
      followUpQuestion: "Anything else?",
    });
    render(
      <SurveyCard
        survey={survey}
        onComplete={() => {}}
        onDismiss={() => {}}
        reducedMotionOverride
      />,
    );

    expect(screen.getByTestId("uv-question").textContent).toBe(
      "How likely are you to recommend us?",
    );
    expect(screen.queryByTestId("uv-follow-up")).toBeNull();

    fireEvent.click(screen.getByTestId("uv-rating-8"));
    expect(screen.getByTestId("uv-follow-up")).toBeTruthy();
    expect(screen.getByTestId("uv-follow-up-input")).toBeTruthy();
    expect(screen.getByTestId("uv-skip").textContent).toBe(COPY.skip);
  });

  it("shows honest thanks after complete and never a second favor CTA", () => {
    const survey = makeSurvey({ followUpQuestion: undefined });
    const onComplete = vi.fn();
    render(
      <SurveyCard
        survey={survey}
        onComplete={onComplete}
        onDismiss={() => {}}
        reducedMotionOverride
        thanksDismissMs={10_000}
      />,
    );

    fireEvent.click(screen.getByTestId("uv-rating-10"));
    expect(onComplete).toHaveBeenCalledWith({
      rating: 10,
      text: undefined,
      followUpRequested: undefined,
    });
    expect(screen.getByTestId("uv-thanks").textContent).toBe(COPY.thanks);
    // No marketing CTA after thanks.
    expect(screen.queryByText(/sign up/i)).toBeNull();
    expect(screen.queryByText(/share/i)).toBeNull();
  });

  it("low-score path offers optional follow-up contact without requiring it", () => {
    const survey = makeSurvey({ followUpQuestion: undefined, type: "nps" });
    const onComplete = vi.fn();
    render(
      <SurveyCard
        survey={survey}
        onComplete={onComplete}
        onDismiss={() => {}}
        reducedMotionOverride
      />,
    );

    fireEvent.click(screen.getByTestId("uv-rating-3"));
    const detractor = screen.getByTestId("uv-detractor");
    expect(detractor).toBeTruthy();
    expect(detractor.textContent).toContain(COPY.followUpOffer);

    fireEvent.click(screen.getByTestId("uv-follow-up-no"));
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 3, followUpRequested: false }),
    );
  });

  it("honors reduced-motion by auto-hiding thanks with zero delay", async () => {
    vi.useFakeTimers();
    const onHide = vi.fn();
    const survey = makeSurvey({ followUpQuestion: undefined });
    render(
      <SurveyCard
        survey={survey}
        onComplete={() => {}}
        onDismiss={() => {}}
        onHide={onHide}
        reducedMotionOverride
        thanksDismissMs={2500}
      />,
    );

    fireEvent.click(screen.getByTestId("uv-rating-9"));
    expect(screen.getByTestId("uv-thanks")).toBeTruthy();
    // reduced motion => delay 0
    await vi.advanceTimersByTimeAsync(0);
    expect(onHide).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("dismiss does not call onComplete", () => {
    const onComplete = vi.fn();
    const onDismiss = vi.fn();
    render(
      <SurveyCard
        survey={makeSurvey()}
        onComplete={onComplete}
        onDismiss={onDismiss}
        reducedMotionOverride
      />,
    );
    fireEvent.click(screen.getByTestId("uv-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
