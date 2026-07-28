/**
 * @uservane/openai-agents/server - fire-once run wrapper + mint for OpenAI Agents.
 *
 * SECURITY: This module MUST run only on the customer's server. It accepts the
 * project SECRET key (`uv_sk_...`) and mints session-bound show-tokens via
 * POST /v1/sdk/tokens. Never import from a client component or browser bundle.
 *
 * Fire-once resolution signal (verified @openai/agents@0.13.5):
 * - Non-streaming: the promise returned by `run(agent, input, opts)` itself,
 *   then read `result.finalOutput`.
 * - Streaming (`{ stream: true }`): `await result.completed` then
 *   `result.finalOutput`.
 * - DO NOT use `agent_end` / RunHooks emitters for fire-once. Those fire PER
 *   AGENT across handoffs and would double-mint.
 *
 * Session key: Agents SDK `groupId` (Runner config or RunConfig). Maps 1:1 to
 * UserVane / Langfuse `sessionId`. Distinct from conversation history
 * (`session` / `conversationId`).
 *
 * Symbols used (verified in installed package d.ts, 2026-07-27):
 * - `run`, `Runner` from `@openai/agents` (re-exported from agents-core)
 * - `RunResult.finalOutput`, `StreamedRunResult.completed`
 * - `RunConfig.groupId` / `new Runner({ groupId })`
 */

import { type MintFeedbackTokenResult, mintFeedbackToken } from "@uservane/agent-core/server";

export {
  type MintDeferredAskLinkInput,
  type MintDeferredAskLinkResult,
  type MintFeedbackTokenError,
  type MintFeedbackTokenInput,
  type MintFeedbackTokenResult,
  mintDeferredAskLink,
  mintFeedbackToken,
} from "@uservane/agent-core/server";

/** Minimal surface of a resolved Agents SDK run result (non-stream or stream). */
export type AgentsRunResultLike = {
  finalOutput?: unknown;
  /** Present on StreamedRunResult; resolve when the stream finishes. */
  completed?: Promise<void>;
};

export type RunWithFeedbackMintOpts = {
  /** Project secret key (`uv_sk_...`). NEVER ship to the browser. */
  secretKey: string;
  /** Respondent identity for the bound token. */
  respondentId: string;
  /** Survey to mint a token for. */
  surveyId: string;
  /**
   * OpenAI Agents session grouping key. Maps 1:1 to UserVane/Langfuse sessionId.
   * Set this to your chat/session id so the linked round-trip and Langfuse
   * session score share one key. Absent => unbound (no mint) + flagged.
   */
  groupId?: string;
  /** Optional task type (PM segmentation; untrusted display metadata). */
  taskType?: string;
  /** Optional observation id (deferred observation-level path). */
  observationId?: string;
  /** API origin. Defaults inside mintFeedbackToken. */
  apiBase?: string;
  /** Injected fetch (tests). */
  fetchImpl?: typeof fetch;
};

export type FeedbackPayload = {
  surveyId: string;
  /**
   * Bound show-token when groupId was set and mint succeeded.
   * Undefined when unbound or the survey was gated (empty tokens).
   */
  showToken?: string;
  /** Equals groupId when bound. Undefined when unbound. */
  sessionId?: string;
  /**
   * True when groupId was absent: no bound mint was attempted.
   * Set groupId to your session id for a linked round-trip.
   */
  unbound?: boolean;
  /** Human-readable reason when unbound or mint returned no token. */
  reason?: string;
  /** Full mint response when a mint was attempted. */
  mint?: MintFeedbackTokenResult;
};

export type RunWithFeedbackResult<TResult extends AgentsRunResultLike = AgentsRunResultLike> = {
  /** finalOutput from the resolved Agents run. */
  finalOutput: unknown;
  /** The underlying Agents SDK result object. */
  result: TResult;
  /** Thread to the client for controller.bind(...). */
  feedback: FeedbackPayload;
};

/**
 * Injectable run function. Tests inject a mock - never call real OpenAI.
 * Production defaults to `@openai/agents` `run` (dynamic import).
 */
export type AgentsRunFn = (
  agent: unknown,
  input: unknown,
  options?: Record<string, unknown>,
) => Promise<AgentsRunResultLike>;

/** Dedup: one mint attempt per result object identity. */
const mintedForResult = new WeakMap<object, FeedbackPayload>();
/** Test counter: how many times mintFeedbackToken was invoked. */
let mintAttemptCount = 0;

/** @internal */
export function __getMintAttemptCountForTests(): number {
  return mintAttemptCount;
}

/** @internal */
export function __resetMintAttemptCountForTests(): void {
  mintAttemptCount = 0;
}

/**
 * Await true run resolution (non-stream or stream) exactly once.
 * Does not call agent_end hooks.
 */
export async function awaitRunResolution<T extends AgentsRunResultLike>(result: T): Promise<T> {
  if (result && typeof result === "object" && result.completed != null) {
    await result.completed;
  }
  return result;
}

/**
 * Mint a bound feedback token for a resolved run, deduped per result object.
 * When groupId is absent, returns unbound feedback without calling the network.
 */
export async function mintFeedbackForRun(
  result: AgentsRunResultLike,
  mint: RunWithFeedbackMintOpts,
): Promise<FeedbackPayload> {
  const surveyId = mint.surveyId;

  if (result && typeof result === "object") {
    const cached = mintedForResult.get(result as object);
    if (cached) {
      return cached;
    }
  }

  const groupId =
    typeof mint.groupId === "string" && mint.groupId.length > 0 ? mint.groupId : undefined;

  if (!groupId) {
    const unbound: FeedbackPayload = {
      surveyId,
      unbound: true,
      reason:
        "groupId absent: mint skipped (unbound). Set groupId to your session id for a linked round-trip.",
    };
    if (result && typeof result === "object") {
      mintedForResult.set(result as object, unbound);
    }
    return unbound;
  }

  mintAttemptCount += 1;
  const mintResult = await mintFeedbackToken({
    secretKey: mint.secretKey,
    respondentId: mint.respondentId,
    sessionId: groupId,
    surveyId: mint.surveyId,
    ...(typeof mint.taskType === "string" && mint.taskType.length > 0
      ? { taskType: mint.taskType }
      : {}),
    ...(typeof mint.observationId === "string" && mint.observationId.length > 0
      ? { observationId: mint.observationId }
      : {}),
    ...(typeof mint.apiBase === "string" ? { apiBase: mint.apiBase } : {}),
    ...(mint.fetchImpl ? { fetchImpl: mint.fetchImpl } : {}),
  });

  const showToken = mintResult.tokens[surveyId];
  const payload: FeedbackPayload =
    typeof showToken === "string" && showToken.length > 0
      ? {
          surveyId,
          showToken,
          sessionId: groupId,
          mint: mintResult,
        }
      : {
          surveyId,
          sessionId: groupId,
          reason: "mint returned no token for survey (gated or unknown surveyId)",
          mint: mintResult,
        };

  if (result && typeof result === "object") {
    mintedForResult.set(result as object, payload);
  }
  return payload;
}

export type RunWithFeedbackOptions = RunWithFeedbackMintOpts & {
  /**
   * Options forwarded to the Agents `run` / `Runner.run` call.
   * Do not put secretKey here.
   */
  runOptions?: Record<string, unknown>;
  /**
   * When true, pass `{ stream: true }` into the run and await `result.completed`.
   */
  stream?: boolean;
  /**
   * Optional pre-built Runner (or any object with `.run`). When provided,
   * `runner.run(agent, input, opts)` is used instead of the free `run` function.
   * Prefer constructing `new Runner({ groupId })` so the Agents trace carries
   * the same groupId the mint uses as sessionId.
   */
  runner?: { run: AgentsRunFn };
  /** Injectable run (tests). Defaults to `@openai/agents` `run`. */
  runFn?: AgentsRunFn;
};

/**
 * Run an OpenAI Agents agent and mint feedback exactly once on true resolution.
 *
 * ```ts
 * import { runWithFeedback } from "@uservane/openai-agents/server";
 * import { Agent, Runner } from "@openai/agents";
 *
 * const groupId = sessionId; // your chat session id
 * const { finalOutput, feedback } = await runWithFeedback(agent, input, {
 *   secretKey: process.env.USERVANE_SECRET_KEY!,
 *   respondentId: userId,
 *   surveyId: "surv_post_task",
 *   groupId,
 *   runner: new Runner({ groupId }),
 * });
 * // thread feedback to the client -> controller.bind({ surveyId, showToken, sessionId })
 * ```
 */
export async function runWithFeedback(
  agent: unknown,
  input: unknown,
  options: RunWithFeedbackOptions,
): Promise<RunWithFeedbackResult> {
  if (!options || typeof options.secretKey !== "string" || options.secretKey.length === 0) {
    throw new Error("runWithFeedback: secretKey is required (server-side only)");
  }
  if (typeof options.respondentId !== "string" || options.respondentId.length === 0) {
    throw new Error("runWithFeedback: respondentId is required");
  }
  if (typeof options.surveyId !== "string" || options.surveyId.length === 0) {
    throw new Error("runWithFeedback: surveyId is required");
  }

  const runOpts: Record<string, unknown> = { ...(options.runOptions ?? {}) };
  if (options.stream === true) {
    runOpts.stream = true;
  }
  const groupId =
    typeof options.groupId === "string" && options.groupId.length > 0 ? options.groupId : null;

  let runFn: AgentsRunFn;
  if (options.runFn) {
    // Injected run (tests / custom); the mint uses options.groupId directly.
    runFn = options.runFn;
  } else if (options.runner && typeof options.runner.run === "function") {
    // Caller supplied a Runner. For the Langfuse session to form, THEIR Runner must
    // itself be constructed with `groupId` - it is not settable per run() call
    // (SharedRunOptions has no groupId; only RunConfig / the Runner constructor does).
    // Documented in the README; we cannot inject groupId into someone else's Runner.
    const runner = options.runner;
    runFn = (a, i, o) => runner.run(a, i, o);
  } else {
    const agents = (await import("@openai/agents")) as {
      run: AgentsRunFn;
      Runner: new (config?: Record<string, unknown>) => { run: AgentsRunFn };
    };
    if (groupId !== null) {
      // The trace group id lives on RunConfig (the Runner constructor), NOT on the
      // per-call run() options - forwarding it there is silently ignored by the SDK,
      // which would leave the emitted trace with groupId=null and give the Langfuse
      // bridge no session to create. Construct a Runner carrying groupId so the trace
      // (and therefore the uservane.satisfaction session-score) has a home.
      const runner = new agents.Runner({ groupId });
      runFn = (a, i, o) => runner.run(a, i, o);
    } else {
      runFn = agents.run;
    }
  }

  const raw = await runFn(agent, input, runOpts);
  const result = await awaitRunResolution(raw);
  const feedback = await mintFeedbackForRun(result, options);

  return {
    finalOutput: result.finalOutput,
    result,
    feedback,
  };
}
