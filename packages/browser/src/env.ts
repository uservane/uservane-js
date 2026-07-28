/** SSR-safe environment helpers. No window/document at module evaluation. */

export function isBrowser(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { document?: unknown }).document !== "undefined"
  );
}

export function getWindow(): Window | null {
  if (!isBrowser()) return null;
  return globalThis as unknown as Window;
}

export function getDocument(): Document | null {
  if (!isBrowser()) return null;
  return (globalThis as unknown as { document: Document }).document;
}

export function prefersReducedMotion(): boolean {
  const w = getWindow();
  if (!w || typeof w.matchMedia !== "function") return false;
  try {
    return w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function prefersDarkScheme(): boolean {
  const w = getWindow();
  if (!w || typeof w.matchMedia !== "function") return false;
  try {
    return w.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/**
 * Defer work until the page is idle. Falls back to setTimeout(0).
 * Used for init network work, not for appearance hunting.
 */
export function onIdle(fn: () => void): () => void {
  const w = getWindow();
  if (!w) {
    // SSR: no-op cancel
    return () => {};
  }
  const ric = (
    w as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }
  ).requestIdleCallback;
  const cic = (
    w as Window & {
      cancelIdleCallback?: (id: number) => void;
    }
  ).cancelIdleCallback;

  if (typeof ric === "function") {
    const id = ric(() => fn(), { timeout: 2000 });
    return () => {
      if (typeof cic === "function") cic(id);
    };
  }
  const tid = w.setTimeout(fn, 0);
  return () => w.clearTimeout(tid);
}
