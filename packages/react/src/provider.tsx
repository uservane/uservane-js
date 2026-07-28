"use client";

import { type IdentifyOptions, UserVane } from "@uservane/browser";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { UserVaneContext, type UserVaneContextValue } from "./context.js";
import { UserVaneErrorBoundary } from "./error-boundary.js";
import { initOnce } from "./init-guard.js";

export type UserVaneProviderProps = {
  /** Publishable key, e.g. `uv_pk_live_...`. Mapped to browser `init({ key })`. */
  apiKey: string;
  /** API origin. Defaults inside `@uservane/browser`. */
  apiBase?: string;
  /** When true, the browser SDK logs decision rationale; boundary logs caught render errors. */
  debug?: boolean;
  children: ReactNode;
};

/**
 * Client-side UserVane provider for React and Next.js App Router.
 *
 * - Marked `"use client"` (and the published bundle carries the same directive).
 * - Calls `UserVane.init` exactly once (module guard survives StrictMode remounts).
 * - SSR-safe: no `window`/`document` access at import; init runs in an effect.
 * - Wraps children in an internal error boundary so UserVane render failures
 *   never reach the host tree.
 */
export function UserVaneProvider({
  apiKey,
  apiBase,
  debug,
  children,
}: UserVaneProviderProps): ReactNode {
  useEffect(() => {
    initOnce({ key: apiKey, apiBase, debug });
  }, [apiKey, apiBase, debug]);

  const survey = useCallback((slug: string) => {
    UserVane.survey(slug);
  }, []);

  const identify = useCallback((opts: IdentifyOptions) => {
    UserVane.identify(opts);
  }, []);

  const value = useMemo<UserVaneContextValue>(
    () => ({
      apiKey,
      apiBase,
      debug,
      survey,
      identify,
    }),
    [apiKey, apiBase, debug, survey, identify],
  );

  return (
    <UserVaneContext.Provider value={value}>
      <UserVaneErrorBoundary debug={debug}>{children}</UserVaneErrorBoundary>
    </UserVaneContext.Provider>
  );
}
