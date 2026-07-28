"use client";

import {
  __resetInitGuardForTests,
  AgentController,
  type AgentControllerDeps,
  type AgentIdentifyOptions,
  type AgentInitOptions,
  type BoundTokenBinding,
  type CompleteOptions,
  type CorrelationSource,
  markInitCalled,
  type ResolveTaskOptions,
  wasInitCalled,
} from "@uservane/agent-core";
import { type ReactNode, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { UserVaneContext, type UserVaneContextValue } from "./context.js";
import { UserVaneErrorBoundary } from "./error-boundary.js";
import { InlineFeedback } from "./inline-feedback.js";

export type UserVaneProviderProps = {
  /** Publishable key, e.g. `uv_pk_live_...`. Mapped to controller init. */
  apiKey: string;
  /** API origin. Defaults inside `@uservane/browser`. */
  apiBase?: string;
  /** When true, the controller logs decision rationale; boundary logs render errors. */
  debug?: boolean;
  /**
   * When true, mechanical triggers are enabled and there is no open-task bar.
   * Default false: blocking-capable, task open until resolveTask.
   */
  nonBlocking?: boolean;
  /** Default survey slug for resolveTask / mechanical triggers. */
  surveySlug?: string;
  /** Optional initial identity (calls identify after init). */
  userId?: string;
  /** Optional initial traits (with identify). */
  traits?: Record<string, unknown>;
  /** Optional correlation reader (show-time snapshot). */
  correlationSource?: CorrelationSource;
  /**
   * When true, render the built-in `<InlineFeedback/>` under children.
   * Default true.
   */
  renderInline?: boolean;
  children: ReactNode;
  /**
   * @internal Test-only fetch override. Not part of the public product API.
   */
  fetchImpl?: typeof fetch;
};

/** Module-level controller so init survives StrictMode remounts. */
let sharedController: AgentController | null = null;

function getOrCreateController(deps?: AgentControllerDeps): AgentController {
  if (!sharedController) {
    sharedController = new AgentController(deps);
  }
  return sharedController;
}

/** @internal - test-only reset of the module controller and init guard. */
export function __resetControllerForTests(deps?: AgentControllerDeps): void {
  sharedController?.resetForTests();
  sharedController = new AgentController(deps);
  if (deps?.fetchImpl) {
    sharedController.setFetchImpl(deps.fetchImpl);
  }
  __resetInitGuardForTests();
}

/** @internal */
export function __getControllerForTests(): AgentController | null {
  return sharedController;
}

/**
 * Client-side UserVane provider for agent chat UIs (React / Next App Router).
 *
 * - Marked `"use client"` (and the published bundle carries the same directive).
 * - Controller init runs once (module guard survives StrictMode remounts).
 * - SSR-safe: no `window` access at import; init runs in an effect.
 * - Wraps children + InlineFeedback in an error boundary.
 */
export function UserVaneProvider({
  apiKey,
  apiBase,
  debug,
  nonBlocking,
  surveySlug,
  userId,
  traits,
  correlationSource,
  renderInline = true,
  children,
  fetchImpl,
}: UserVaneProviderProps): ReactNode {
  const controller = useMemo(() => getOrCreateController(), []);

  useEffect(() => {
    if (fetchImpl) {
      controller.setFetchImpl(fetchImpl);
    }
    if (correlationSource) {
      controller.setCorrelationSource(correlationSource);
    }
    if (!wasInitCalled()) {
      markInitCalled();
      const opts: AgentInitOptions = {
        key: apiKey,
        apiBase,
        debug,
        nonBlocking,
        surveySlug,
      };
      controller.init(opts);
    }
  }, [controller, apiKey, apiBase, debug, nonBlocking, surveySlug, fetchImpl, correlationSource]);

  useEffect(() => {
    if (userId) {
      controller.identify({ userId, traits });
    } else {
      // Ensure anonymous key path still identifies for bootstrap tokens.
      controller.identify({ traits });
    }
  }, [controller, userId, traits]);

  const active = useSyncExternalStore(
    (onStoreChange) => controller.subscribe(() => onStoreChange()),
    () => controller.getActive(),
    () => null,
  );

  const identify = useCallback(
    (opts?: AgentIdentifyOptions) => {
      controller.identify(opts);
    },
    [controller],
  );

  const resolveTask = useCallback(
    (opts?: ResolveTaskOptions) => {
      controller.resolveTask(opts);
    },
    [controller],
  );

  const noteUserTurn = useCallback(() => {
    controller.noteUserTurn();
  }, [controller]);

  const survey = useCallback(
    (slug: string) => {
      controller.survey(slug);
    },
    [controller],
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

  const isTaskOpen = useCallback(() => controller.isTaskOpen(), [controller]);

  const bind = useCallback(
    (binding: BoundTokenBinding) => {
      controller.bind(binding);
    },
    [controller],
  );

  const value = useMemo<UserVaneContextValue>(
    () => ({
      apiKey,
      apiBase,
      debug,
      controller,
      active,
      identify,
      resolveTask,
      noteUserTurn,
      survey,
      dismiss,
      complete,
      isTaskOpen,
      bind,
    }),
    [
      apiKey,
      apiBase,
      debug,
      controller,
      active,
      identify,
      resolveTask,
      noteUserTurn,
      survey,
      dismiss,
      complete,
      isTaskOpen,
      bind,
    ],
  );

  return (
    <UserVaneContext.Provider value={value}>
      <UserVaneErrorBoundary debug={debug}>
        {children}
        {renderInline ? <InlineFeedback controller={controller} debug={debug} /> : null}
      </UserVaneErrorBoundary>
    </UserVaneContext.Provider>
  );
}
