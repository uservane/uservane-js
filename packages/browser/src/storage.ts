/**
 * Local suppression memory (dismissed/answered). Server is authoritative;
 * this honors dismissals across sessions when storage is available and acts
 * as a fail-closed backup for the never-re-prompt guarantee.
 */

import { getWindow } from "./env.js";

const STORAGE_KEY = "uv_suppression_v1";

function readRaw(): Set<string> {
  const w = getWindow();
  if (!w) return new Set();
  try {
    const raw = w.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeRaw(set: Set<string>): void {
  const w = getWindow();
  if (!w) return;
  try {
    w.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // private mode / quota - ignore
  }
}

export function loadLocalSuppression(): Set<string> {
  return readRaw();
}

export function rememberSuppressed(surveyId: string): void {
  const set = readRaw();
  if (set.has(surveyId)) return;
  set.add(surveyId);
  writeRaw(set);
}

export function isLocallySuppressed(surveyId: string): boolean {
  return readRaw().has(surveyId);
}
