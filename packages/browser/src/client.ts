/**
 * Network client for bootstrap (definitions + suppression + show-tokens)
 * and response ingestion. Failures never produce a partial widget.
 */

import { log, logError } from "./debug.js";
import type { BootstrapResponse, SubmitPayload } from "./types.js";

export type FetchBootstrapParams = {
  apiBase: string;
  key: string;
  userId: string | null;
  traits: Record<string, unknown>;
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch;
};

/**
 * Fetch survey definitions, targeting rules, suppression set, and show-tokens.
 * Returns null on any failure (network, non-2xx, invalid JSON, bad apiBase).
 * Fail closed: never throws to the host.
 */
export async function fetchBootstrap(
  params: FetchBootstrapParams,
): Promise<BootstrapResponse | null> {
  const { apiBase, key, userId, traits, fetchImpl } = params;
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    logError("fetch unavailable");
    return null;
  }

  try {
    // new URL must live inside try: malformed apiBase must not escape.
    const url = new URL("/v1/sdk/bootstrap", apiBase.endsWith("/") ? apiBase : `${apiBase}/`);
    url.searchParams.set("key", key);
    if (userId) url.searchParams.set("userId", userId);

    const res = await doFetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ key, userId, traits }),
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) {
      logError("bootstrap non-ok", res.status);
      return null;
    }
    const data: unknown = await res.json();
    const parsed = parseBootstrap(data);
    if (!parsed) {
      logError("bootstrap invalid payload");
      return null;
    }
    log("bootstrap ok", parsed.surveys.length, "surveys");
    return parsed;
  } catch (err) {
    logError("bootstrap failed", err);
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseBootstrap(data: unknown): BootstrapResponse | null {
  if (!isRecord(data)) return null;
  if (!Array.isArray(data.surveys)) return null;
  const suppression = Array.isArray(data.suppression)
    ? data.suppression.filter((x): x is string => typeof x === "string")
    : [];
  const showTokens: Record<string, string> = {};
  if (isRecord(data.showTokens)) {
    for (const [k, v] of Object.entries(data.showTokens)) {
      if (typeof v === "string") showTokens[k] = v;
    }
  }
  // Surveys may also embed a showToken field - fold in if present.
  const surveys: BootstrapResponse["surveys"] = [];
  for (const raw of data.surveys) {
    if (!isRecord(raw)) return null;
    if (typeof raw.id !== "string" || typeof raw.slug !== "string") return null;
    if (typeof raw.question !== "string") return null;
    const presentation =
      raw.presentation === "inline" || raw.presentation === "banner" ? raw.presentation : "corner";
    const trigger = raw.trigger === "manual" ? "manual" : "auto";
    if (typeof raw.showToken === "string") {
      showTokens[raw.id] = raw.showToken;
    }
    const surveyType =
      raw.type === "csat" || raw.type === "ces" || raw.type === "pmf" || raw.type === "nps"
        ? raw.type
        : "nps";
    surveys.push({
      id: raw.id,
      slug: raw.slug,
      type: surveyType,
      question: raw.question,
      followUpQuestion: typeof raw.followUpQuestion === "string" ? raw.followUpQuestion : undefined,
      presentation,
      corner:
        raw.corner === "bottom-left" ||
        raw.corner === "top-right" ||
        raw.corner === "top-left" ||
        raw.corner === "bottom-right"
          ? raw.corner
          : "bottom-right",
      trigger,
      delayMs: typeof raw.delayMs === "number" ? raw.delayMs : undefined,
      samplePercent: typeof raw.samplePercent === "number" ? raw.samplePercent : undefined,
      targeting: Array.isArray(raw.targeting)
        ? (raw.targeting as BootstrapResponse["surveys"][number]["targeting"])
        : undefined,
      showBadge: raw.showBadge === true,
      endLabels:
        isRecord(raw.endLabels) &&
        typeof raw.endLabels.low === "string" &&
        typeof raw.endLabels.high === "string"
          ? { low: raw.endLabels.low, high: raw.endLabels.high }
          : undefined,
    });
  }
  return { surveys, suppression, showTokens };
}

export type SubmitParams = {
  apiBase: string;
  key: string;
  payload: SubmitPayload;
  fetchImpl?: typeof fetch;
};

/**
 * POST a response with the single-use show-token.
 * Fire-and-forget friendly: returns success boolean; never throws to host.
 */
export async function submitResponse(params: SubmitParams): Promise<boolean> {
  const { apiBase, key, payload, fetchImpl } = params;
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") return false;

  try {
    // new URL must live inside try: malformed apiBase must not escape.
    const url = new URL("/v1/sdk/responses", apiBase.endsWith("/") ? apiBase : `${apiBase}/`);

    const res = await doFetch(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ key, ...payload }),
      credentials: "omit",
      keepalive: true,
    });
    if (!res.ok) {
      logError("submit non-ok", res.status);
      return false;
    }
    log("submit ok", payload.surveyId, payload.rating);
    return true;
  } catch (err) {
    logError("submit failed", err);
    return false;
  }
}
