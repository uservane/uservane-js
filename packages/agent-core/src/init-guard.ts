/**
 * Module-level guard so controller.init runs at most once per JS realm.
 * Survives React 18 StrictMode double-mount.
 */

let initCalled = false;

export function markInitCalled(): boolean {
  if (initCalled) return false;
  initCalled = true;
  return true;
}

export function wasInitCalled(): boolean {
  return initCalled;
}

/** @internal - test-only reset of the once-guard. */
export function __resetInitGuardForTests(): void {
  initCalled = false;
}
