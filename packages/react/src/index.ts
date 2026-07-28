"use client";

/**
 * @uservane/react - thin React wrapper over `@uservane/browser`.
 *
 * Does not reimplement the widget or show-decision; it only wires init,
 * identify, and survey through a provider, hook, and error boundary.
 *
 * Next.js App Router: this module is a Client Component (`"use client"`).
 * Import `UserVaneProvider` from a client boundary (or a file that already
 * has `"use client"`). No `window` access at import time.
 *
 * ```tsx
 * import { UserVaneProvider, useUserVane } from "@uservane/react";
 *
 * <UserVaneProvider apiKey="uv_pk_live_...">
 *   <App />
 * </UserVaneProvider>
 *
 * // inside a child:
 * const { survey, identify } = useUserVane();
 * survey("nps-q1");
 * ```
 */

// Re-export browser SDK public types so consumers need one import surface.
export type {
  BootstrapResponse,
  Corner,
  IdentifyOptions,
  InitOptions,
  Presentation,
  SurveyDefinition,
  SurveyType,
} from "@uservane/browser";
export type { UserVaneContextValue } from "./context.js";
/** @internal - test-only. */
export { __resetInitGuardForTests } from "./init-guard.js";
export { UserVaneProvider, type UserVaneProviderProps } from "./provider.js";
export { type UseUserVaneResult, useUserVane } from "./use-user-vane.js";
