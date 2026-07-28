/**
 * Anonymous respondent key minting (design section 3 [R4]).
 *
 * Prefer a persistent per-device id in localStorage (`uv_anon_<projectKey>`).
 * Fall back to an in-memory per-conversation id when storage is unavailable.
 * Weaker cross-device guarantee than an identified userId; stated, not hidden.
 */

import type { IdentityKind } from "./types.js";

const MEMORY_KEYS = new Map<string, string>();

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `uv_anon_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `uv_anon_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function storageKey(projectKey: string): string {
  return `uv_anon_${projectKey}`;
}

/**
 * Prefer window.localStorage (jsdom / browsers). Node 22+ may expose a global
 * `localStorage` that is defined but unusable without --localstorage-file;
 * that broken global must not shadow the real store.
 */
function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof localStorage !== "undefined" && localStorage) {
      return localStorage;
    }
  } catch {
    // ignore
  }
  return null;
}

function readLocalStorage(key: string): string | null {
  try {
    const store = getLocalStorage();
    if (!store) return null;
    const v = store.getItem(key);
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): boolean {
  try {
    const store = getLocalStorage();
    if (!store) return false;
    store.setItem(key, value);
    // Verify write (Node experimental localStorage can no-op / throw later).
    return store.getItem(key) === value;
  } catch {
    return false;
  }
}

export type AnonKeyResult = {
  respondentId: string;
  identityKind: Exclude<IdentityKind, "identified">;
};

/**
 * Mint or reuse a stable anonymous respondent key for this project key.
 * Reuse is required: re-minting every session would churn suppression.
 */
export function resolveAnonymousKey(projectKey: string): AnonKeyResult {
  const sk = storageKey(projectKey);
  const stored = readLocalStorage(sk);
  if (stored) {
    return { respondentId: stored, identityKind: "anon-device" };
  }

  const minted = randomId();
  if (writeLocalStorage(sk, minted)) {
    return { respondentId: minted, identityKind: "anon-device" };
  }

  const existing = MEMORY_KEYS.get(projectKey);
  if (existing) {
    return { respondentId: existing, identityKind: "anon-conversation" };
  }
  MEMORY_KEYS.set(projectKey, minted);
  return { respondentId: minted, identityKind: "anon-conversation" };
}

/** @internal - test-only. Clears in-memory map (does not touch localStorage). */
export function __resetAnonMemoryForTests(): void {
  MEMORY_KEYS.clear();
}
