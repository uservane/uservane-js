import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetControllerForTests, UserVaneProvider } from "../src/index.js";

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
    __resetControllerForTests();
  });

  afterEach(() => {
    cleanup();
    __resetControllerForTests();
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

    expect(screen.getByTestId("host")).toBeTruthy();
    expect(screen.getByTestId("host-sibling").textContent).toBe("host-ok");
    expect(screen.queryByTestId("uv-child")).toBeNull();

    consoleSpy.mockRestore();
  });
});
