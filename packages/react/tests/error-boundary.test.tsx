import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUserVane = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  survey: vi.fn(),
}));

vi.mock("@uservane/browser", () => ({
  UserVane: mockUserVane,
}));

import { __resetInitGuardForTests, UserVaneProvider } from "../src/index.js";

function Boom(): ReactNode {
  throw new Error("intentional child render throw");
}

function Host({ children }: { children: ReactNode }): ReactNode {
  return (
    <div data-testid="host">
      <span data-testid="host-sibling">host-ok</span>
      {children}
    </div>
  );
}

describe("UserVane error boundary", () => {
  beforeEach(() => {
    __resetInitGuardForTests();
    mockUserVane.init.mockClear();
  });

  afterEach(() => {
    cleanup();
    __resetInitGuardForTests();
    mockUserVane.init.mockClear();
  });

  it("catches a child render throw and does not rethrow into the host", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(
        <Host>
          <UserVaneProvider apiKey="uv_pk_boundary">
            <div data-testid="uv-child">
              <Boom />
            </div>
          </UserVaneProvider>
        </Host>,
      );
    }).not.toThrow();

    // Host tree outside the provider remains mounted.
    expect(screen.getByTestId("host")).toBeTruthy();
    expect(screen.getByTestId("host-sibling").textContent).toBe("host-ok");
    // Throwing subtree is replaced by the boundary fallback (null).
    expect(screen.queryByTestId("uv-child")).toBeNull();

    consoleSpy.mockRestore();
  });
});
