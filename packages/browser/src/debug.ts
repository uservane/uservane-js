/** Debug logging - only when `debug: true`. Never throws. */

let debugEnabled = false;

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export function isDebug(): boolean {
  return debugEnabled;
}

export function log(...args: unknown[]): void {
  if (!debugEnabled) return;
  try {
    // eslint-disable-next-line no-console
    console.info("[UserVane]", ...args);
  } catch {
    // ignore
  }
}

export function logError(...args: unknown[]): void {
  if (!debugEnabled) return;
  try {
    // eslint-disable-next-line no-console
    console.warn("[UserVane]", ...args);
  } catch {
    // ignore
  }
}
