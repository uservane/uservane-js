import { type InitOptions, UserVane } from "@uservane/browser";

/**
 * Module-level guard so UserVane.init runs at most once per JS realm.
 * Survives React 18 StrictMode double-mount (refs reset; this does not) and
 * provider re-renders.
 */
let initCalled = false;

export function initOnce(options: InitOptions): void {
  if (initCalled) return;
  initCalled = true;
  UserVane.init(options);
}

/** @internal - test-only reset of the once-guard. */
export function __resetInitGuardForTests(): void {
  initCalled = false;
}
