/**
 * @uservane/browser - UserVane in-product survey widget SDK.
 *
 * Public API is queued, idempotent, and SSR-safe.
 * Errors inside UserVane never propagate to the host application.
 *
 * ```ts
 * import { UserVane } from "@uservane/browser";
 * UserVane.init({ key: "uv_pk_live_…" });
 * UserVane.identify({ userId: "u_123", traits: { plan: "pro" } });
 * UserVane.survey("nps-q1");
 * ```
 */

import { guard } from "./guard.js";
import { Runtime, type RuntimeDeps } from "./runtime.js";
import type { IdentifyOptions, InitOptions } from "./types.js";

// Re-export public types for consumers.
export type {
  BootstrapResponse,
  Corner,
  IdentifyOptions,
  InitOptions,
  Presentation,
  ShowReason,
  SubmitPayload,
  SurveyDefinition,
  SurveyType,
  WidgetState,
} from "./types.js";

export {
  DEFAULT_API_BASE,
  DEFAULT_AUTO_DELAY_MS,
  DETRACTOR_MAX,
  THANKS_AUTO_DISMISS_MS,
} from "./types.js";

// ---------------------------------------------------------------------------
// Platform-agnostic core (shared with React Native and other non-DOM hosts).
// Additive only: no behavior change for the browser widget surface.
// ---------------------------------------------------------------------------

export {
  type FetchBootstrapParams,
  fetchBootstrap,
  type SubmitParams,
  submitResponse,
} from "./client.js";
export { allCopyValues, COPY } from "./copy.js";
export { isDebug, log, logError, setDebug } from "./debug.js";
export { catchPromise, guard, guardAsync, guardedListener } from "./guard.js";
export { isSampledIn, stableHash } from "./hash.js";
export {
  isLowScoreFollowUp,
  PMF_NOT,
  PMF_SOMEWHAT,
  PMF_VERY,
  parseSurveyType,
  SCALE_BY_TYPE,
  type ScaleConfig,
  type ScaleOption,
  scaleForType,
} from "./scale.js";
export {
  type Decision,
  decideShow,
  findSurveyBySlug,
  isSuppressed,
  matchesTargeting,
} from "./show-decision.js";

/** Singleton runtime. Lazily created; no window access at import time. */
let runtime: Runtime | null = null;
let testDeps: RuntimeDeps | undefined;

function getRuntime(): Runtime {
  if (!runtime) {
    runtime = new Runtime(testDeps);
  }
  return runtime;
}

export const UserVane = {
  /**
   * Initialize the SDK. Queued and idempotent. Defers network work to idle.
   * Safe to call during SSR (no-ops DOM work).
   */
  init(options: InitOptions): void {
    guard("init", () => getRuntime().init(options));
  },

  /**
   * Identify the current respondent. Repeatable (traits merge/update).
   * Safe before or after init; triggers re-evaluation of buffered surveys.
   */
  identify(options: IdentifyOptions): void {
    guard("identify", () => getRuntime().identify(options));
  },

  /**
   * Imperative survey trigger by slug. If rules are not loaded yet, the
   * trigger is buffered and evaluated once loaded. Never drops a survey
   * because identify/init ordering lagged.
   */
  survey(slug: string): void {
    guard("survey", () => getRuntime().survey(slug));
  },
} as const;

export type UserVaneAPI = typeof UserVane;

// ---------------------------------------------------------------------------
// Test-only surface (not part of the public contract for app code).
// Tree-shaken from production bundles when unused.
// ---------------------------------------------------------------------------

/** @internal */
export function __resetForTests(deps?: RuntimeDeps): void {
  runtime?.resetForTests();
  runtime = null;
  testDeps = deps;
}

/** @internal */
export function __getRuntimeForTests(): Runtime {
  return getRuntime();
}

/** @internal - force an internal throw path for error-isolation tests. */
export function __forceThrowForTests(): void {
  guard("forceThrow", () => {
    throw new Error("intentional internal error");
  });
}
