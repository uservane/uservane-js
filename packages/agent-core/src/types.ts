import type { SurveyDefinition } from "@uservane/browser";

/**
 * How the respondent was keyed for bootstrap + submit.
 * `model-requested` is the issuer-gated agent tool path (headline-excluded).
 */
export type IdentityKind = "identified" | "anon-device" | "anon-conversation" | "model-requested";

/**
 * Correlation ids captured at show-decision time and carried to submit.
 * Empty fields mean the response will be stored `unlinked` (never mislinked).
 *
 * Set `traceId` + `observationId` (developer-provided) for a per-step
 * observation-level Langfuse score. Session-only is the conversation rating path.
 * Framework auto-read of these ids remains deferred (developer-provided only).
 */
export type CorrelationSnapshot = {
  traceId?: string;
  sessionId?: string;
  observationId?: string;
  taskType?: string;
};

/**
 * Pluggable reader for correlation ids at show-decision time.
 *
 * Production path: prefer `controller.bind({ surveyId, showToken, sessionId?,
 * observationId?, traceId? })` after the server mints a bound token. That
 * installs the token and developer-provided correlation ids without an AI-SDK
 * auto-read.
 *
 * Observation-level scores ARE supported via developer-provided
 * `traceId` + `observationId` on mint/bind. Only the framework auto-READ of
 * those ids remains deferred (NEEDS CEO VERIFICATION).
 *
 * Custom CorrelationSource remains for hosts that thread ids another way.
 * Do not hardcode an unverified AI-SDK / OTel auto-read here.
 */
export type CorrelationSource = {
  capture(): CorrelationSnapshot;
};

/**
 * Server-minted bound token + correlation for one survey.
 * Produced by mintFeedbackToken on the server; installed via bind().
 */
export type BoundTokenBinding = {
  surveyId: string;
  /** v2 show-token signed with the project secret, bound to correlation ids. */
  showToken: string;
  /** Authoritative session id (must match the token payload at submit). */
  sessionId?: string;
  observationId?: string;
  /** Pair with observationId for a per-step observation score. */
  traceId?: string;
  taskType?: string;
};

/** Active ask presented to the conversation (render state). */
export type ActiveAsk = {
  survey: SurveyDefinition;
  /** Single-use server show-token; required for response ingestion. */
  showToken: string;
  /** Snapshot taken at show-decision time (not re-read at submit). */
  correlation: CorrelationSnapshot;
  /**
   * When set, complete() submits this identityKind instead of the controller's
   * respondent identity. Used for model-requested (agent tool) captures.
   */
  identityKind?: IdentityKind;
};

export type AgentInitOptions = {
  /** Publishable key, e.g. `uv_pk_live_...`. */
  key: string;
  /** API origin. Defaults inside `@uservane/browser`. */
  apiBase?: string;
  /** When true, logs show/no-show rationale and link/unlink reasons. */
  debug?: boolean;
  /**
   * When true, mechanical triggers (afterTurn / onSessionEnd / relative-time)
   * may fire. Default false: agent is blocking-capable and a task is open
   * until `resolveTask` fires.
   */
  nonBlocking?: boolean;
  /** Default survey slug for resolveTask / mechanical triggers. */
  surveySlug?: string;
  /**
   * Relative-time trigger (ms after init). Only evaluated in nonBlocking mode.
   * Fires once through decideShow.
   */
  relativeTimeMs?: number;
};

export type AgentIdentifyOptions = {
  /** When omitted, an anonymous key is minted (never-dark for anonymous). */
  userId?: string;
  traits?: Record<string, unknown>;
};

export type ResolveTaskOptions = {
  taskId?: string;
  outcome?: string;
  /** Override the init survey slug for this resolution. */
  surveySlug?: string;
  /**
   * Out-of-band / async resolution (deferAsk). Closes the task so in-session
   * asks are barred for this resolution, but does NOT render InlineFeedback.
   * Use mintDeferredAskLink on the server to deliver the ask later via the
   * customer's own channel (email, SMS, follow-up session). UserVane does not
   * send email/SMS; last-mile non-intrusion is the customer's contract.
   */
  defer?: boolean;
};

export type CompleteOptions = {
  rating: number;
  text?: string;
  followUpRequested?: boolean;
};

/**
 * Required contract for the headless-only path.
 * Without both predicates, the SDK refuses to show (fail-safe).
 */
export type HeadlessContract = {
  isTaskOpen: () => boolean;
  onDismiss: () => void;
};
