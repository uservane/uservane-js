import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUserVane = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  survey: vi.fn(),
}));

vi.mock("@uservane/browser", () => ({
  UserVane: mockUserVane,
}));

import { __resetInitGuardForTests, UserVaneProvider, useUserVane } from "../src/index.js";

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

function RerenderHarness({ children }: { children: ReactNode }): ReactNode {
  const [n, setN] = useState(0);
  return (
    <div>
      <button type="button" data-testid="bump" onClick={() => setN((x) => x + 1)}>
        bump {n}
      </button>
      {children}
    </div>
  );
}

function resetMocks(): void {
  mockUserVane.init.mockClear();
  mockUserVane.identify.mockClear();
  mockUserVane.survey.mockClear();
}

describe("UserVaneProvider", () => {
  beforeEach(() => {
    __resetInitGuardForTests();
    resetMocks();
  });

  afterEach(() => {
    cleanup();
    __resetInitGuardForTests();
    resetMocks();
  });

  it("calls UserVane.init exactly once with mapped options", () => {
    render(
      <UserVaneProvider apiKey="uv_pk_test" apiBase="https://api.example" debug>
        <span>child</span>
      </UserVaneProvider>,
    );

    expect(mockUserVane.init).toHaveBeenCalledTimes(1);
    expect(mockUserVane.init).toHaveBeenCalledWith({
      key: "uv_pk_test",
      apiBase: "https://api.example",
      debug: true,
    });
  });

  it("init runs once under React 18 StrictMode double-mount", () => {
    render(
      <StrictMode>
        <UserVaneProvider apiKey="uv_pk_strict">
          <span>child</span>
        </UserVaneProvider>
      </StrictMode>,
    );

    expect(mockUserVane.init).toHaveBeenCalledTimes(1);
    expect(mockUserVane.init).toHaveBeenCalledWith({
      key: "uv_pk_strict",
      apiBase: undefined,
      debug: undefined,
    });
  });

  it("init runs once across provider re-renders", () => {
    render(
      <RerenderHarness>
        <UserVaneProvider apiKey="uv_pk_rerender">
          <span>child</span>
        </UserVaneProvider>
      </RerenderHarness>,
    );

    expect(mockUserVane.init).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("bump"));
    fireEvent.click(screen.getByTestId("bump"));

    expect(mockUserVane.init).toHaveBeenCalledTimes(1);
  });

  it("useUserVane survey and identify call through to the browser SDK", () => {
    render(
      <UserVaneProvider apiKey="uv_pk_hook">
        <Probe />
      </UserVaneProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "survey" }));
    expect(mockUserVane.survey).toHaveBeenCalledTimes(1);
    expect(mockUserVane.survey).toHaveBeenCalledWith("nps-q1");

    fireEvent.click(screen.getByRole("button", { name: "identify" }));
    expect(mockUserVane.identify).toHaveBeenCalledTimes(1);
    expect(mockUserVane.identify).toHaveBeenCalledWith({
      userId: "u_1",
      traits: { plan: "pro" },
    });
  });

  it("useUserVane survey and identify keep stable references across re-renders", () => {
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
      <UserVaneProvider apiKey="uv_pk_stable">
        <Capture />
      </UserVaneProvider>,
    );

    fireEvent.click(screen.getByTestId("self-bump"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const first = refs[0];
    const last = refs[refs.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || last === undefined) {
      throw new Error("expected capture refs");
    }
    expect(last.survey).toBe(first.survey);
    expect(last.identify).toBe(first.identify);
  });

  it("useUserVane throws outside a provider", () => {
    // Suppress React error boundary noise for the intentional throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/useUserVane must be used within a UserVaneProvider/);
    spy.mockRestore();
  });
});
