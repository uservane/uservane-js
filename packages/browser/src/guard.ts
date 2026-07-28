/**
 * Host-error isolation. Every public entry and every deferred path must
 * route through these helpers so UserVane never throws into the host app.
 */

import { logError } from "./debug.js";

/** Synchronous guard: swallows throws, logs under debug only. */
export function guard(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    logError(`${label} error`, err);
  }
}

/**
 * Async guard: runs `fn`, catches sync throws, and attaches `.catch` so
 * promise rejections never become unhandled rejections on the host.
 */
export function guardAsync(label: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result != null && typeof (result as Promise<void>).then === "function") {
      void (result as Promise<void>).catch((err: unknown) => {
        logError(`${label} error`, err);
      });
    }
  } catch (err) {
    logError(`${label} error`, err);
  }
}

/** Wrap a listener / callback so its throws never reach the host. */
export function guardedListener<A extends unknown[]>(
  label: string,
  fn: (...args: A) => void,
): (...args: A) => void {
  return (...args: A) => {
    try {
      fn(...args);
    } catch (err) {
      logError(`${label} error`, err);
    }
  };
}

/** Attach a terminal catch to a fire-and-forget promise. */
export function catchPromise(label: string, promise: Promise<unknown>): void {
  void promise.catch((err: unknown) => {
    logError(`${label} error`, err);
  });
}
