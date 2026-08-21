/**
 * @uservane/langfuse-push - server-only adapter for the Langfuse round-trip.
 *
 * SECURITY: This package MUST run only on the CUSTOMER's server / cron / edge
 * function. It holds BOTH the UserVane secret key (to poll the pending-scores
 * queue) AND the Langfuse write keys. UserVane never receives, stores, or
 * transmits the Langfuse key and is never in the eval write path.
 *
 * Never import this package from a client component or browser bundle.
 *
 * Flow (design §4):
 *   1. Poll GET /v1/sdk/pending-scores (secret-key authed, tenant-scoped)
 *   2. For each linked score, create a Langfuse score:
 *      - OBSERVATION-level when BOTH traceId + observationId are present
 *      - else SESSION-level when sessionId is present
 *      - else fail-not-orphan (never mislink / half-id observation score)
 *   3. POST /v1/sdk/pending-scores/ack with per-id delivered | failed
 *
 * Score create signature (verified against installed langfuse@3.38.20 /
 * langfuse-core@3.38.20 CreateLangfuseScoreBody = ScoreBody, 2026-07-27):
 *   ScoreBody includes optional traceId?, sessionId?, observationId? (all
 *   string | null). Observation score body carries traceId + observationId
 *   (no sessionId required). Session score body carries sessionId alone.
 * Delivery is confirmed by drainAndConfirm(), which awaits the SDK's pending
 * event processing and only then flushes with a callback. Neither drain method
 * is sufficient alone: a bare flush(cb) straight after score() sends nothing and
 * still reports success, while flushAsync() sends but swallows the failure.
 * Session-level scores: langfuse.com/docs/scores/custom.
 */

import { Langfuse } from "langfuse";

const DEFAULT_API_BASE = "https://api.uservane.com";
const DEFAULT_SCORE_NAME = "uservane.satisfaction";
const DEFAULT_LIMIT = 50;

/** Minimal Langfuse surface we use (matches installed SDK; injectable for tests). */
export type LangfuseScoreClient = {
  score(body: {
    /** Stable id so Langfuse UPSERTS on re-push (no duplicate scores). */
    id: string;
    name: string;
    value: number;
    comment?: string | null;
    sessionId?: string | null;
    /** Required with observationId for observation-level scores. */
    traceId?: string | null;
    observationId?: string | null;
  }): unknown;
  /**
   * Drain the ingestion queue and report the result via the callback.
   *
   * MUST NOT be called directly after `score()`. See {@link drainAndConfirm}:
   * `score()` enqueues through an async processing step, so a bare `flush(cb)`
   * finds an empty queue and reports success without sending anything.
   */
  flush(callback: (err?: unknown) => void): void;
};

/**
 * Send whatever `score()` queued and report the real ingestion outcome.
 *
 * Neither SDK drain method does both halves on its own (verified empirically
 * against langfuse@3.38.20 with a local ingestion server):
 *
 * - `flush(cb)` called straight after `score()` finds an EMPTY queue, returns in
 *   about 1ms, and calls back with NO error having sent ZERO requests. `score()`
 *   enqueues via an async processing step, so the item is not in the queue yet.
 *   Acking `delivered` on that callback reports success for a score that was
 *   never transmitted, and the trailing scores of a run are then lost when a
 *   cron process exits.
 * - `flushAsync()` awaits that processing and does send, but swallows the
 *   failure. Its own docstring: "This function always resolves, even if there
 *   were errors when flushing."
 *
 * So do what `flushAsync` does first (await the pending event processing), then
 * flush WITH a callback so a real failure still surfaces. Confirmed to return
 * the error for a 500 and for a 207 carrying per-event errors, and no error on
 * a clean 200.
 */
async function drainAndConfirm(lf: LangfuseScoreClient): Promise<unknown> {
  // `pendingEventProcessingPromises` is declared `private` in the SDK's types,
  // so it cannot sit on the structural interface above without making the real
  // Langfuse class unassignable to it. Read it defensively instead.
  const pending = (lf as unknown as Record<string, unknown>).pendingEventProcessingPromises as
    | Record<string, Promise<unknown>>
    | undefined;
  if (pending !== undefined && pending !== null && typeof pending === "object") {
    await Promise.all(Object.values(pending)).catch(() => {
      // A processing failure still shows up on the flush callback below.
    });
  } else {
    // SDK internals moved. Yield the event loop so the async enqueue can land
    // rather than flushing an empty queue and calling that a delivery.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return await new Promise<unknown>((resolve) => {
    try {
      lf.flush((err?: unknown) => resolve(err ?? null));
    } catch (err) {
      resolve(err ?? new Error("flush threw"));
    }
  });
}

export type PushPendingScoresOpts = {
  uservane: {
    /** Project secret key (`uv_sk_...`). NEVER ship to the browser. */
    secretKey: string;
    /** API origin. Defaults to https://api.uservane.com. */
    apiBase?: string;
  };
  langfuse: {
    publicKey: string;
    secretKey: string;
    baseUrl?: string;
  };
  /** Score name. Defaults to `uservane.satisfaction` (namespaced). */
  scoreName?: string;
  /** Max scores to pull this run. */
  limit?: number;
  /**
   * When true, also re-poll rows previously acked as `failed`
   * (`?includeFailed=true` on the queue).
   */
  includeFailed?: boolean;
  /** Injected fetch (tests). */
  fetchImpl?: typeof fetch;
  /**
   * Injected Langfuse client factory (tests). Production builds
   * `new Langfuse({ publicKey, secretKey, baseUrl })`.
   */
  createLangfuse?: (cfg: {
    publicKey: string;
    secretKey: string;
    baseUrl?: string;
  }) => LangfuseScoreClient;
};

export type PushPendingScoresResult = {
  delivered: number;
  failed: number;
};

type PendingScore = {
  id: string;
  sessionId: string | null;
  observationId: string | null;
  traceId: string | null;
  rating: number | null;
  text: string | null;
  taskType: string | null;
  surveyId: string;
  at: string;
};

// (Outer transient-retry removed: the Langfuse SDK's own fetchWithRetry already
// retries transient ingestion errors, and flush(cb) surfaces only the FINAL outcome.
// A permanent/exhausted failure -> ack failed, re-pollable next run.)

/**
 * Poll UserVane pending scores, push each as a Langfuse session or observation
 * score, ack.
 *
 * Runs in the CUSTOMER's server/cron. Holds UserVane secret + Langfuse keys
 * server-side only. Returns `{ delivered, failed }` counts for this run.
 */
export async function pushPendingScores(
  opts: PushPendingScoresOpts,
): Promise<PushPendingScoresResult> {
  if (
    !opts?.uservane ||
    typeof opts.uservane.secretKey !== "string" ||
    opts.uservane.secretKey.length === 0
  ) {
    throw new Error("pushPendingScores: uservane.secretKey is required (server-side only)");
  }
  if (
    !opts.langfuse ||
    typeof opts.langfuse.publicKey !== "string" ||
    opts.langfuse.publicKey.length === 0 ||
    typeof opts.langfuse.secretKey !== "string" ||
    opts.langfuse.secretKey.length === 0
  ) {
    throw new Error("pushPendingScores: langfuse.publicKey and langfuse.secretKey are required");
  }

  const scoreName =
    typeof opts.scoreName === "string" && opts.scoreName.length > 0
      ? opts.scoreName
      : DEFAULT_SCORE_NAME;
  // Namespaced by default; refuse empty / un-namespaced only when caller forces it
  // via scoreName - the default is always uservane.*.
  const limit =
    typeof opts.limit === "number" && opts.limit > 0
      ? Math.min(Math.floor(opts.limit), 100)
      : DEFAULT_LIMIT;
  const base = (opts.uservane.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const fetchFn = opts.fetchImpl ?? fetch;

  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (opts.includeFailed === true) {
    qs.set("includeFailed", "true");
  }

  const pollUrl = `${base}/v1/sdk/pending-scores?${qs.toString()}`;
  const pollRes = await fetchFn(pollUrl, {
    method: "GET",
    headers: {
      authorization: `Bearer ${opts.uservane.secretKey}`,
      accept: "application/json",
    },
  });
  if (!pollRes.ok) {
    let message = `pushPendingScores: poll HTTP ${pollRes.status}`;
    try {
      const errBody = (await pollRes.json()) as {
        error?: { message?: string };
        message?: string;
      };
      const m = errBody?.error?.message ?? errBody?.message;
      if (typeof m === "string" && m.length > 0) message = m;
    } catch {
      // ignore
    }
    const err = new Error(message) as Error & { status: number };
    err.status = pollRes.status;
    throw err;
  }

  const pollJson = (await pollRes.json()) as { scores?: PendingScore[] };
  const scores = Array.isArray(pollJson.scores) ? pollJson.scores : [];
  if (scores.length === 0) {
    return { delivered: 0, failed: 0 };
  }

  const createLf =
    opts.createLangfuse ??
    ((cfg) =>
      new Langfuse({
        publicKey: cfg.publicKey,
        secretKey: cfg.secretKey,
        ...(cfg.baseUrl !== undefined ? { baseUrl: cfg.baseUrl } : {}),
      }));

  const lf = createLf({
    publicKey: opts.langfuse.publicKey,
    secretKey: opts.langfuse.secretKey,
    ...(opts.langfuse.baseUrl !== undefined ? { baseUrl: opts.langfuse.baseUrl } : {}),
  });

  const results: Array<{ id: string; state: "delivered" | "failed" }> = [];
  let delivered = 0;
  let failed = 0;

  for (const score of scores) {
    const sessionId =
      typeof score.sessionId === "string" && score.sessionId.length > 0 ? score.sessionId : null;
    const observationId =
      typeof score.observationId === "string" && score.observationId.length > 0
        ? score.observationId
        : null;
    const traceId =
      typeof score.traceId === "string" && score.traceId.length > 0 ? score.traceId : null;

    // Observation-level requires BOTH ids (Langfuse ScoreBody.traceId + observationId).
    // Never push a half-id observation score (orphan / mislink). Prefer observation
    // when both present; else session-level; else fail-not-orphan.
    const isObservation = traceId !== null && observationId !== null;
    if (!isObservation && sessionId === null) {
      results.push({ id: score.id, state: "failed" });
      failed += 1;
      continue;
    }
    if (typeof score.rating !== "number" || !Number.isFinite(score.rating)) {
      results.push({ id: score.id, state: "failed" });
      failed += 1;
      continue;
    }

    // Stable id makes re-push idempotent. drainAndConfirm() is what actually
    // sends this and reports the outcome; a bare flush() here would return
    // "delivered" without sending. The SDK's fetchWithRetry already retries
    // transient errors, so an error back from it is the final outcome
    // -> ack failed (re-pollable), never a silent loss.
    if (isObservation) {
      lf.score({
        id: `uv-${score.id}`,
        name: scoreName,
        value: score.rating,
        comment: score.text ?? null,
        traceId,
        observationId,
      });
    } else {
      lf.score({
        id: `uv-${score.id}`,
        name: scoreName,
        value: score.rating,
        comment: score.text ?? null,
        sessionId,
      });
    }
    const flushErr = await drainAndConfirm(lf);
    if (flushErr) {
      results.push({ id: score.id, state: "failed" });
      failed += 1;
    } else {
      results.push({ id: score.id, state: "delivered" });
      delivered += 1;
    }
  }

  if (results.length > 0) {
    const ackUrl = `${base}/v1/sdk/pending-scores/ack`;
    const ackRes = await fetchFn(ackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.uservane.secretKey}`,
      },
      body: JSON.stringify({ results }),
    });
    if (!ackRes.ok) {
      let message = `pushPendingScores: ack HTTP ${ackRes.status}`;
      try {
        const errBody = (await ackRes.json()) as {
          error?: { message?: string };
          message?: string;
        };
        const m = errBody?.error?.message ?? errBody?.message;
        if (typeof m === "string" && m.length > 0) message = m;
      } catch {
        // ignore
      }
      const err = new Error(message) as Error & { status: number };
      err.status = ackRes.status;
      throw err;
    }
  }

  return { delivered, failed };
}
