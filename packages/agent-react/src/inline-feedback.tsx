"use client";

import type { ActiveAsk, AgentController, CompleteOptions } from "@uservane/agent-core";
import { type ReactNode, useCallback, useEffect, useSyncExternalStore } from "react";
import { UserVaneErrorBoundary } from "./error-boundary.js";

export type InlineFeedbackProps = {
  controller: AgentController;
  debug?: boolean;
  /**
   * When true, the next user action (any pointer/keyboard on the document)
   * dismisses the active ask (dismiss-on-next-action).
   */
  dismissOnNextAction?: boolean;
  /** Optional custom render. Defaults to a compact rating row. */
  children?: (args: {
    active: ActiveAsk;
    complete: (result: CompleteOptions) => void;
    dismiss: () => void;
  }) => ReactNode;
};

/**
 * Inline ask surface for host chat UIs.
 *
 * - Reserves a fixed min-height slot (0 CLS) even when no ask is active.
 * - Subscribes to the controller; renders the active ask INLINE.
 * - Dismissible by the next user action (default on).
 * - Wrapped in an error boundary so a render throw never reaches the host tree.
 */
export function InlineFeedback({
  controller,
  debug,
  dismissOnNextAction = true,
  children,
}: InlineFeedbackProps): ReactNode {
  return (
    <UserVaneErrorBoundary debug={debug}>
      <InlineFeedbackInner controller={controller} dismissOnNextAction={dismissOnNextAction}>
        {children}
      </InlineFeedbackInner>
    </UserVaneErrorBoundary>
  );
}

function InlineFeedbackInner({
  controller,
  dismissOnNextAction,
  children,
}: Omit<InlineFeedbackProps, "debug">): ReactNode {
  const active = useSyncExternalStore(
    (onStoreChange) => controller.subscribe(() => onStoreChange()),
    () => controller.getActive(),
    () => null,
  );

  const dismiss = useCallback(() => {
    controller.dismiss();
  }, [controller]);

  const complete = useCallback(
    (result: CompleteOptions) => {
      controller.complete(result);
    },
    [controller],
  );

  // Dismiss-on-next-action: any subsequent pointer/key interaction clears the ask.
  useEffect(() => {
    if (!active || !dismissOnNextAction) return;
    let armed = false;
    const armId = window.setTimeout(() => {
      armed = true;
    }, 0);

    const onAction = () => {
      if (!armed) return;
      // Ignore events that originate inside the ask itself (rating click).
      // Handled via data attribute check in capture phase.
    };

    const onPointer = (ev: Event) => {
      if (!armed) return;
      const t = ev.target;
      if (t instanceof Element && t.closest("[data-uv-inline-feedback]")) {
        return;
      }
      dismiss();
    };

    const onKey = (ev: Event) => {
      if (!armed) return;
      // Same containment as onPointer: typing inside the feedback component (e.g. a
      // custom children render with a text input) must not self-dismiss.
      const t = ev.target;
      if (t instanceof Element && t.closest("[data-uv-inline-feedback]")) {
        return;
      }
      dismiss();
    };

    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(armId);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      void onAction;
    };
  }, [active, dismissOnNextAction, dismiss]);

  // Fixed min-height slot: reserves space whether or not an ask is shown (0 CLS).
  return (
    <div
      data-uv-inline-feedback
      data-testid="uv-inline-feedback"
      data-active={active ? "true" : "false"}
      style={{
        minHeight: 48,
        boxSizing: "border-box",
        width: "100%",
      }}
      aria-live="polite"
    >
      {active
        ? children
          ? children({ active, complete, dismiss })
          : defaultAsk(active, complete, dismiss)
        : null}
    </div>
  );
}

function defaultAsk(
  active: ActiveAsk,
  complete: (result: CompleteOptions) => void,
  dismiss: () => void,
): ReactNode {
  const survey = active.survey;
  return (
    <fieldset
      data-testid="uv-inline-ask"
      style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}
    >
      <legend
        data-testid="uv-inline-question"
        style={{ margin: "0 0 8px", fontSize: 14, padding: 0 }}
      >
        {survey.question}
      </legend>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <button
            key={n}
            type="button"
            data-testid={`uv-rate-${n}`}
            onClick={() => complete({ rating: n })}
            style={{
              minWidth: 28,
              height: 28,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {n}
          </button>
        ))}
        <button type="button" data-testid="uv-inline-dismiss" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </fieldset>
  );
}
