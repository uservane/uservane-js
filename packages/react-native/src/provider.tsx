import type { IdentifyOptions } from "@uservane/browser";
import { type ReactNode, useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { UserVaneContext, type UserVaneContextValue } from "./context.js";
import { type ControllerDeps, NativeController } from "./controller.js";
import { UserVaneErrorBoundary } from "./error-boundary.js";
import { SurveyCard } from "./survey-card.js";
import type { ActiveSurvey, SurveyCompleteResult } from "./types.js";

export type UserVaneProviderProps = {
  /** Publishable key, e.g. `uv_pk_live_...`. */
  apiKey: string;
  /** API origin. Defaults inside `@uservane/browser` client. */
  apiBase?: string;
  /** When true, logs decision rationale; boundary logs caught render errors. */
  debug?: boolean;
  /** Optional initial identity (calls identify after init). */
  userId?: string;
  /** Optional initial traits (with userId). */
  traits?: Record<string, unknown>;
  children: ReactNode;
  /**
   * @internal Test-only fetch override. Not part of the public product API.
   */
  fetchImpl?: typeof fetch;
};

/** Module-level controller so init survives StrictMode remounts. */
let sharedController: NativeController | null = null;
let initCalled = false;

function getOrCreateController(): NativeController {
  if (!sharedController) {
    sharedController = new NativeController();
  }
  return sharedController;
}

/** @internal - test-only reset of the module controller and init guard. */
export function __resetControllerForTests(deps?: ControllerDeps): void {
  sharedController?.resetForTests();
  sharedController = new NativeController(deps);
  if (deps?.fetchImpl) {
    sharedController.setFetchImpl(deps.fetchImpl);
  }
  initCalled = false;
}

/** @internal */
export function __getControllerForTests(): NativeController | null {
  return sharedController;
}

/**
 * React Native UserVane provider.
 *
 * - Init-once (survives StrictMode remounts).
 * - Native-safe: no window/document access.
 * - Renders the survey card when a survey is active.
 * - Error boundary so a render throw never reaches the host tree.
 */
export function UserVaneProvider({
  apiKey,
  apiBase,
  debug,
  userId,
  traits,
  children,
  fetchImpl,
}: UserVaneProviderProps): ReactNode {
  const controller = useMemo(() => getOrCreateController(), []);

  useEffect(() => {
    if (fetchImpl) {
      controller.setFetchImpl(fetchImpl);
    }
    if (!initCalled) {
      initCalled = true;
      controller.init({ key: apiKey, apiBase, debug });
    }
  }, [controller, apiKey, apiBase, debug, fetchImpl]);

  useEffect(() => {
    if (userId) {
      controller.identify({ userId, traits });
    }
  }, [controller, userId, traits]);

  const active = useSyncExternalStore(
    (onStoreChange) => controller.subscribe(() => onStoreChange()),
    () => controller.getActive(),
    () => null,
  );

  const survey = useCallback(
    (slug: string) => {
      controller.survey(slug);
    },
    [controller],
  );

  const identify = useCallback(
    (opts: IdentifyOptions) => {
      controller.identify(opts);
    },
    [controller],
  );

  const dismiss = useCallback(() => {
    controller.dismiss();
  }, [controller]);

  const complete = useCallback(
    (result: SurveyCompleteResult) => {
      controller.complete(result);
    },
    [controller],
  );

  const hide = useCallback(() => {
    controller.hide();
  }, [controller]);

  const value = useMemo<UserVaneContextValue>(
    () => ({
      apiKey,
      apiBase,
      debug,
      survey,
      identify,
      active,
      dismiss,
      complete,
    }),
    [apiKey, apiBase, debug, survey, identify, active, dismiss, complete],
  );

  return (
    <UserVaneContext.Provider value={value}>
      <UserVaneErrorBoundary debug={debug}>
        {children}
        <ActiveSurveyHost active={active} onComplete={complete} onDismiss={dismiss} onHide={hide} />
      </UserVaneErrorBoundary>
    </UserVaneContext.Provider>
  );
}

function ActiveSurveyHost({
  active,
  onComplete,
  onDismiss,
  onHide,
}: {
  active: ActiveSurvey | null;
  onComplete: (result: SurveyCompleteResult) => void;
  onDismiss: () => void;
  onHide: () => void;
}): ReactNode {
  if (!active) return null;
  return (
    <SurveyCard
      key={active.survey.id}
      survey={active.survey}
      onComplete={onComplete}
      onDismiss={onDismiss}
      onHide={onHide}
    />
  );
}
