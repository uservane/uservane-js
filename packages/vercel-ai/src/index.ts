"use client";

/**
 * @uservane/vercel-ai - agent-native capture for Vercel AI SDK hosts.
 *
 * Thin positioning shim over `@uservane/agent-core` + `@uservane/agent-react`.
 * Headless core (AgentController) + React `<UserVaneProvider>` / `<InlineFeedback/>`.
 * Reuses `@uservane/browser` for bootstrap, decideShow, submit. Does not reimplement
 * show-token, suppression, or sampling.
 *
 * Session correlation (production linked path):
 * 1. Server: `import { mintFeedbackToken } from "@uservane/vercel-ai/server"` with the
 *    project SECRET key + the same sessionId passed to Langfuse propagateAttributes.
 * 2. Thread showToken + sessionId to the client.
 * 3. Client: `controller.bind({ surveyId, showToken, sessionId })` then resolveTask.
 * Submit carries the bound token + sessionId -> response stored `linked`.
 *
 * Without bind(), the unbound bootstrap path still works (stored `unlinked`).
 * Do not import the `/server` entry from client code (secret key must stay server-side).
 * Observation-level auto-read remains deferred.
 *
 * // NEEDS CEO VERIFICATION: observation-level auto-read (deferred)
 *
 * ```tsx
 * import { UserVaneProvider, useUserVane } from "@uservane/vercel-ai";
 *
 * <UserVaneProvider apiKey="uv_pk_live_..." surveySlug="post-task">
 *   <Chat />
 * </UserVaneProvider>
 *
 * // after server mints a bound token:
 * controller.bind({ surveyId, showToken, sessionId });
 * // at true resolution:
 * const { resolveTask } = useUserVane();
 * resolveTask({ outcome: "refunded" });
 * ```
 *
 * Headless-only: construct AgentController with `headlessMode: true` and supply
 * `setHeadlessContract({ isTaskOpen, onDismiss })` or shows are refused.
 */

export type {
  ActiveAsk,
  AgentIdentifyOptions,
  AgentInitOptions,
  BootstrapResponse,
  BoundTokenBinding,
  CompleteOptions,
  Corner,
  CorrelationSnapshot,
  CorrelationSource,
  HeadlessContract,
  IdentityKind,
  InitOptions,
  Presentation,
  ResolveTaskOptions,
  SurveyDefinition,
  SurveyType,
} from "@uservane/agent-core";
/** @internal - test-only. */
export {
  __resetAnonMemoryForTests,
  __resetInitGuardForTests,
  AgentController,
  type AgentControllerDeps,
  type AgentControllerListener,
  emptyCorrelationSource,
  explicitCorrelationSource,
  hasAnyCorrelationId,
  unlinkReason,
} from "@uservane/agent-core";
export type { UserVaneContextValue, UseUserVaneResult } from "@uservane/agent-react";
export {
  __getControllerForTests,
  __resetControllerForTests,
  InlineFeedback,
  type InlineFeedbackProps,
  UserVaneErrorBoundary,
  UserVaneProvider,
  type UserVaneProviderProps,
  useUserVane,
} from "@uservane/agent-react";
export {
  createRequestUserFeedbackTool,
  REQUEST_USER_FEEDBACK_DESCRIPTION,
  REQUEST_USER_FEEDBACK_NAME,
  type RequestUserFeedbackArgs,
  type RequestUserFeedbackResult,
  requestUserFeedbackDescriptor,
} from "./request-user-feedback-tool.js";
