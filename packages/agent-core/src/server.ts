/**
 * @uservane/agent-core/server - server-only helpers for agent-native capture.
 *
 * SECURITY: This module MUST run only on the customer's server (Next.js route
 * handler / server action / edge function). It accepts the project SECRET key
 * and POSTs to /v1/sdk/tokens. Never import this entry from client components
 * or ship the secret key to the browser.
 *
 * Correlation model (verified, 2026-07-27):
 * - Langfuse accepts session-level scores (sessionId alone).
 * - Observation-level scores need developer-provided traceId + observationId.
 * - Mint a token bound to those ids, then thread showToken + ids to the client
 *   for controller.bind(). Framework auto-read of trace/observation ids is
 *   deferred (developer-provided path only).
 *
 * @example
 * ```ts
 * import { mintFeedbackToken } from "@uservane/agent-core/server";
 *
 * const { tokens } = await mintFeedbackToken({
 *   secretKey: process.env.USERVANE_SECRET_KEY!,
 *   respondentId: userId,
 *   sessionId,
 *   // optional: per-step observation score
 *   // observationId, traceId,
 *   surveyId: "surv_post_task",
 * });
 * // thread tokens[surveyId] + sessionId (+ optional traceId/observationId) to bind()
 * ```
 */

const DEFAULT_API_BASE = "https://api.uservane.com";

export type MintFeedbackTokenInput = {
  /** Project secret key (`uv_sk_...`). NEVER ship to the browser. */
  secretKey: string;
  /** Respondent identity (identified userId or server-known anon key). */
  respondentId: string;
  /**
   * Authoritative session id - the same value passed to Langfuse
   * propagateAttributes. Bound into the show-token server-side.
   */
  sessionId: string;
  /** Optional: limit mint to one survey. */
  surveyId?: string;
  observationId?: string;
  /**
   * Authoritative trace id for observation-level scores. Pair with observationId.
   * Developer-provided only; framework auto-read remains deferred.
   */
  traceId?: string;
  /** Untrusted display metadata for PM segmentation. */
  taskType?: string;
  /**
   * Issuer opt-in for the request_user_feedback agent tool. When true, each
   * minted token attests amr:true so model-requested submits are accepted.
   * Default false: the model cannot self-enable the tool.
   * Enabling carries a self-selection warning: model-requested captures are
   * headline-excluded (identity_kind=model-requested).
   */
  allowModelRequested?: boolean;
  /** API origin. Defaults to https://api.uservane.com. */
  apiBase?: string;
  /** Injected fetch (tests). */
  fetchImpl?: typeof fetch;
};

export type MintFeedbackTokenResult = {
  /** surveyId -> v2 show-token bound to sessionId. Empty when gated. */
  tokens: Record<string, string>;
  /** Survey ids already answered/dismissed for this respondent. */
  suppression: string[];
  issuedAt: string;
};

export type MintFeedbackTokenError = {
  ok: false;
  status: number;
  message: string;
};

/**
 * Mint session-bound show-tokens via POST /v1/sdk/tokens (secret-key authed).
 *
 * Runs the same server-side gates as bootstrap (suppression, quiet period,
 * monthly cap, per-survey max). Returns empty `tokens` when every survey is
 * gated - callers should treat that as "do not show", not an error.
 *
 * Throws on network failure or non-2xx (including 401 for bad secret).
 */
export async function mintFeedbackToken(
  input: MintFeedbackTokenInput,
): Promise<MintFeedbackTokenResult> {
  if (!input || typeof input.secretKey !== "string" || input.secretKey.length === 0) {
    throw new Error("mintFeedbackToken: secretKey is required (server-side only)");
  }
  if (typeof input.respondentId !== "string" || input.respondentId.length === 0) {
    throw new Error("mintFeedbackToken: respondentId is required");
  }
  if (typeof input.sessionId !== "string" || input.sessionId.length === 0) {
    throw new Error("mintFeedbackToken: sessionId is required");
  }

  const base = (input.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const url = `${base}/v1/sdk/tokens`;
  const fetchFn = input.fetchImpl ?? fetch;

  const body: Record<string, string | boolean> = {
    respondentId: input.respondentId,
    sessionId: input.sessionId,
  };
  if (typeof input.surveyId === "string" && input.surveyId.length > 0) {
    body.surveyId = input.surveyId;
  }
  if (typeof input.observationId === "string" && input.observationId.length > 0) {
    body.observationId = input.observationId;
  }
  if (typeof input.traceId === "string" && input.traceId.length > 0) {
    body.traceId = input.traceId;
  }
  if (typeof input.taskType === "string" && input.taskType.length > 0) {
    body.taskType = input.taskType;
  }
  if (input.allowModelRequested === true) {
    body.allowModelRequested = true;
  }

  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.secretKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `mintFeedbackToken: HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: { message?: string }; message?: string };
      const m = errBody?.error?.message ?? errBody?.message;
      if (typeof m === "string" && m.length > 0) message = m;
    } catch {
      // ignore parse errors
    }
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  const json = (await res.json()) as {
    tokens?: Record<string, string>;
    suppression?: string[];
    issuedAt?: string;
  };

  return {
    tokens: json.tokens && typeof json.tokens === "object" ? json.tokens : {},
    suppression: Array.isArray(json.suppression) ? json.suppression : [],
    issuedAt: typeof json.issuedAt === "string" ? json.issuedAt : new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// mintDeferredAskLink - out-of-band / async resolution (deferAsk)
// ---------------------------------------------------------------------------

export type MintDeferredAskLinkInput = {
  /** Project secret key (`uv_sk_...`). NEVER ship to the browser. */
  secretKey: string;
  /** Respondent identity for the bound show-token. */
  respondentId: string;
  /** Survey to ask. */
  surveyId: string;
  /** Optional session id for linked deferred capture. */
  sessionId?: string;
  /** API origin. Defaults to https://api.uservane.com. */
  apiBase?: string;
  /** Injected fetch (tests). */
  fetchImpl?: typeof fetch;
};

export type MintDeferredAskLinkResult = {
  /**
   * Hosted ask URL (`/l/:token`) to deliver on your channel (e.g. a confirmation
   * email). IMPORTANT: a response captured through this URL is a STANDALONE hosted
   * capture - it is NOT correlated to the agent session (no Langfuse session score
   * for it). Use it when you just want a deferred ask; use the session-linked path
   * below when you need the deferred feedback to correlate to the run.
   */
  url: string;
  /**
   * Session-bound show-token (v2). This is the SESSION-LINKED deferred path: thread
   * `showToken` + `sessionId` to the user's NEXT in-app session and call
   * `controller.bind({ surveyId, showToken, sessionId })` there. That capture links
   * (correlation_state='linked') and round-trips a Langfuse session score. The URL
   * above does not consume this token.
   */
  showToken: string;
  issuedAt: string;
  surveyId: string;
  respondentId: string;
  sessionId: string | null;
};

/**
 * Mint a deferred (out-of-band) ask for async / off-platform resolution (deferAsk).
 *
 * TWO delivery modes, deliberately distinct (see the result type):
 * - `url`: a hosted ask link for your own channel (email etc.). The capture is
 *   STANDALONE - not correlated to the agent session. UserVane has no email/SMS
 *   sender; you deliver the URL.
 * - `showToken` + `sessionId`: the SESSION-LINKED path. Bind them in the user's next
 *   in-app session (`controller.bind(...)`) so the deferred capture correlates to the
 *   run and round-trips a Langfuse session score.
 * A session-linked ask via the emailed URL (rather than an in-app bind) is a planned
 * follow-up; it requires the hosted flow to attest the session, which it does not yet.
 *
 * Last-mile non-intrusion contract (enforcement ends where your channel begins):
 * - Deliver exactly one ask per resolved outcome (no double-send).
 * - Deliver only after the true outcome is confirmed (not on "submitted"/"handed off").
 * - When the ask lands in-app (follow-up session), it is subject to that surface's
 *   open-task bar (never interrupts the user's next task).
 *
 * Reuses the hosted-link show-token mint (issueLinkShowToken) - no new token type.
 *
 * @example
 * ```ts
 * // After the outcome is confirmed off-platform (e.g. refund settled):
 * const { url, showToken, sessionId } = await mintDeferredAskLink({
 *   secretKey: process.env.USERVANE_SECRET_KEY!,
 *   respondentId: userId,
 *   surveyId: "surv_post_task",
 *   sessionId,
 * });
 * // Standalone deferred ask: put `url` in your confirmation email.
 * // Session-linked deferred ask: thread showToken + sessionId to the user's next
 * // in-app session and controller.bind({ surveyId, showToken, sessionId }).
 * // Either way, do NOT fire an in-session resolveTask ask.
 * ```
 */
export async function mintDeferredAskLink(
  input: MintDeferredAskLinkInput,
): Promise<MintDeferredAskLinkResult> {
  if (!input || typeof input.secretKey !== "string" || input.secretKey.length === 0) {
    throw new Error("mintDeferredAskLink: secretKey is required (server-side only)");
  }
  if (typeof input.respondentId !== "string" || input.respondentId.length === 0) {
    throw new Error("mintDeferredAskLink: respondentId is required");
  }
  if (typeof input.surveyId !== "string" || input.surveyId.length === 0) {
    throw new Error("mintDeferredAskLink: surveyId is required");
  }

  const base = (input.apiBase ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const url = `${base}/v1/sdk/deferred-ask-link`;
  const fetchFn = input.fetchImpl ?? fetch;

  const body: Record<string, string> = {
    respondentId: input.respondentId,
    surveyId: input.surveyId,
  };
  if (typeof input.sessionId === "string" && input.sessionId.length > 0) {
    body.sessionId = input.sessionId;
  }

  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.secretKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `mintDeferredAskLink: HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: { message?: string }; message?: string };
      const m = errBody?.error?.message ?? errBody?.message;
      if (typeof m === "string" && m.length > 0) message = m;
    } catch {
      // ignore parse errors
    }
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  const json = (await res.json()) as {
    ok?: boolean;
    reason?: string;
    url?: string | null;
    showToken?: string | null;
    issuedAt?: string;
    surveyId?: string;
    respondentId?: string;
    sessionId?: string | null;
  };

  if (json.ok === false || !json.url || !json.showToken) {
    const reason = typeof json.reason === "string" ? json.reason : "gated";
    throw new Error(`mintDeferredAskLink: declined (${reason})`);
  }

  return {
    url: json.url,
    showToken: json.showToken,
    issuedAt: typeof json.issuedAt === "string" ? json.issuedAt : new Date().toISOString(),
    surveyId: typeof json.surveyId === "string" ? json.surveyId : input.surveyId,
    respondentId: typeof json.respondentId === "string" ? json.respondentId : input.respondentId,
    sessionId: typeof json.sessionId === "string" ? json.sessionId : null,
  };
}
