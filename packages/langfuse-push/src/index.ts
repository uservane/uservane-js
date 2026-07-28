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
 * Confirm delivery with flush(cb), NOT flushAsync (flushAsync swallows
 * ingestion HTTP failures). Session-level scores: langfuse.com/docs/scores/custom.
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
   * Drain the ingestion queue and report the result via the callback. We use
   * flush(cb), NOT flushAsync(): verified against langfuse-core@3.38.20
   * (lib/index.mjs), flushAsync() SWALLOWS an ingestion HTTP failure
   * (logIngestionError + resolve, never rejects), so it cannot distinguish a
   * delivered score from a lost one. flush(cb) surfaces the final error (after
   * the SDK's own fetch retries) as the callback's `err` argument, which is the
   * only reliable delivery confirmation the SDK exposes.
   */
  flush(callback: (err?: unknown) => void): void;
};

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

    // Stable id makes re-push idempotent. flush(cb) confirms delivery (flushAsync
    // would swallow a failure - see LangfuseScoreClient). The SDK's fetchWithRetry
    // already retries transient errors; a callback err here is the final outcome
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
    const flushErr = await new Promise<unknown>((resolve) => {
      try {
        lf.flush((err?: unknown) => resolve(err ?? null));
      } catch (err) {
        resolve(err ?? new Error("flush threw"));
      }
    });
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
