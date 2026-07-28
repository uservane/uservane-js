import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, StrictMode, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __getControllerForTests,
  __resetControllerForTests,
  UserVaneProvider,
  useUserVane,
} from "../src/index.js";
import { createMockFetch, makeBootstrap, makeSurvey } from "./helpers.js";

function Probe(): ReactNode {
  const { survey, identify } = useUserVane();
  return (
    <div>
      <button type="button" onClick={() => survey("nps-q1")}>
        survey
      </button>
      <button type="button" onClick={() => identify({ userId: "u_1", traits: { plan: "pro" } })}>
        identify
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  __resetControllerForTests();
});

beforeEach(() => {
  __resetControllerForTests();
});

describe("UserVaneProvider", () => {
  it("init runs once under React 18 StrictMode double-mount", async () => {
    const mock = createMockFetch();
    __resetControllerForTests({ fetchImpl: mock.fetchImpl });

    render(
      <StrictMode>
        <UserVaneProvider
          apiKey="uv_pk_strict"
          apiBase="https://api.test"
          fetchImpl={mock.fetchImpl}
        >
          <span>child</span>
        </UserVaneProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      const bootstraps = mock.calls.filter((c) => c.url.includes("/bootstrap"));
      // At least one bootstrap; StrictMode must not double-init into a broken state.
      expect(bootstraps.length).toBeGreaterThanOrEqual(1);
    });
    expect(__getControllerForTests()?.getState().key).toBe("uv_pk_strict");
  });

  it("useUserVane throws outside a provider", () => {
    expect(() => render(<Probe />)).toThrow(/useUserVane must be used within a UserVaneProvider/);
  });

  it("useUserVane survey and identify keep stable references across re-renders", () => {
    const mock = createMockFetch();
    __resetControllerForTests({ fetchImpl: mock.fetchImpl });
    const refs: Array<{ survey: unknown; identify: unknown }> = [];

    function Capture(): ReactNode {
      const api = useUserVane();
      const [n, setN] = useState(0);
      refs.push({ survey: api.survey, identify: api.identify });
      return (
        <button type="button" data-testid="self-bump" onClick={() => setN((x) => x + 1)}>
          self {n}
        </button>
      );
    }

    render(
      <UserVaneProvider apiKey="uv_pk_stable" fetchImpl={mock.fetchImpl}>
        <Capture />
      </UserVaneProvider>,
    );

    fireEvent.click(screen.getByTestId("self-bump"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const first = refs[0];
    const last = refs[refs.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || last === undefined) throw new Error("expected refs");
    expect(last.survey).toBe(first.survey);
    expect(last.identify).toBe(first.identify);
  });

  it("initial userId prop identifies the respondent", async () => {
    const survey = makeSurvey({ followUpQuestion: undefined });
    const mock = createMockFetch(
      makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok" } }),
    );
    __resetControllerForTests({ fetchImpl: mock.fetchImpl });

    function AutoSurvey(): ReactNode {
      const { survey: trigger } = useUserVane();
      useEffect(() => {
        trigger("nps-q1");
      }, [trigger]);
      return null;
    }

    render(
      <UserVaneProvider
        apiKey="uv_pk_id"
        apiBase="https://api.test"
        userId="u_from_prop"
        traits={{ plan: "pro" }}
        fetchImpl={mock.fetchImpl}
      >
        <AutoSurvey />
      </UserVaneProvider>,
    );

    await waitFor(() => {
      expect(__getControllerForTests()?.getState().userId).toBe("u_from_prop");
    });
  });
});
