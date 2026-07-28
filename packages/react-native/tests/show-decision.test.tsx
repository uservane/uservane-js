import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __getControllerForTests,
  __resetControllerForTests,
  UserVaneProvider,
  useUserVane,
} from "../src/index.js";
import { createMockFetch, flush, makeBootstrap, makeSurvey } from "./helpers.js";

function Trigger({ slug, userId }: { slug: string; userId?: string }): ReactNode {
  const { survey, identify } = useUserVane();
  useEffect(() => {
    if (userId) identify({ userId });
    survey(slug);
  }, [survey, identify, slug, userId]);
  return <span data-testid="ready">ready</span>;
}

afterEach(() => {
  cleanup();
  __resetControllerForTests();
});

beforeEach(() => {
  __resetControllerForTests();
});

describe("show-decision reuse (suppression + show-token)", () => {
  it("shows a survey when bootstrap issues a show-token", async () => {
    const survey = makeSurvey({ followUpQuestion: undefined });
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_1" } }),
    );
    __resetControllerForTests({ fetchImpl: mock.fetchImpl });

    render(
      <UserVaneProvider apiKey="uv_pk_show" apiBase="https://api.test" fetchImpl={mock.fetchImpl}>
        <Trigger slug="nps-q1" userId="u1" />
      </UserVaneProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("uv-survey-card")).toBeTruthy();
    });
    expect(screen.getByTestId("uv-question").textContent).toBe(survey.question);
  });

  it("does not show a server-suppressed survey", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({
        surveys: [survey],
        suppression: [survey.id],
        showTokens: { [survey.id]: "tok_should_not_matter" },
      }),
    );
    __resetControllerForTests({ fetchImpl: mock.fetchImpl });

    render(
      <UserVaneProvider apiKey="uv_pk_sup" apiBase="https://api.test" fetchImpl={mock.fetchImpl}>
        <Trigger slug="nps-q1" userId="u1" />
      </UserVaneProvider>,
    );

    await flush(20);
    await waitFor(() => {
      expect(screen.getByTestId("ready")).toBeTruthy();
    });
    expect(screen.queryByTestId("uv-survey-card")).toBeNull();
  });

  it("fail-safe: bootstrap error means no show", async () => {
    const mock = createMockFetch();
    mock.setBootstrapError();
    __resetControllerForTests({ fetchImpl: mock.fetchImpl });

    render(
      <UserVaneProvider apiKey="uv_pk_fail" apiBase="https://api.test" fetchImpl={mock.fetchImpl}>
        <Trigger slug="nps-q1" userId="u1" />
      </UserVaneProvider>,
    );

    await flush(20);
    await waitFor(() => {
      expect(screen.getByTestId("ready")).toBeTruthy();
    });
    expect(screen.queryByTestId("uv-survey-card")).toBeNull();
    const state = __getControllerForTests()?.getState();
    expect(state?.rulesFailed).toBe(true);
  });

  it("posts response with the show-token and never re-prompts after answering", async () => {
    const survey = makeSurvey({ followUpQuestion: undefined });
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok_secure" } }),
    );
    __resetControllerForTests({ fetchImpl: mock.fetchImpl });

    function Probe(): ReactNode {
      const { survey: trigger, identify } = useUserVane();
      useEffect(() => {
        identify({ userId: "u_answer" });
        trigger("nps-q1");
      }, [trigger, identify]);
      return (
        <button type="button" data-testid="retrigger" onClick={() => trigger("nps-q1")}>
          again
        </button>
      );
    }

    render(
      <UserVaneProvider apiKey="uv_pk_tok" apiBase="https://api.test" fetchImpl={mock.fetchImpl}>
        <Probe />
      </UserVaneProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("uv-rating-10")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("uv-rating-10"));

    await waitFor(() => {
      expect(mock.submittedBodies.length).toBeGreaterThanOrEqual(1);
    });

    const body = mock.submittedBodies[0] as Record<string, unknown>;
    expect(body.showToken).toBe("tok_secure");
    expect(body.surveyId).toBe(survey.id);
    expect(body.rating).toBe(10);

    // Hide thanks so we can assert re-prompt is blocked.
    __getControllerForTests()?.hide();
    await flush(0);

    fireEvent.click(screen.getByTestId("retrigger"));
    await flush(10);
    expect(screen.queryByTestId("uv-survey-card")).toBeNull();
  });

  it("does not show when server omits show-token", async () => {
    const survey = makeSurvey();
    const mock = createMockFetch(
      makeBootstrap({
        surveys: [survey],
        showTokens: {},
      }),
    );
    __resetControllerForTests({ fetchImpl: mock.fetchImpl });

    render(
      <UserVaneProvider apiKey="uv_pk_notok" apiBase="https://api.test" fetchImpl={mock.fetchImpl}>
        <Trigger slug="nps-q1" userId="u1" />
      </UserVaneProvider>,
    );

    await flush(20);
    expect(screen.queryByTestId("uv-survey-card")).toBeNull();
  });
});
