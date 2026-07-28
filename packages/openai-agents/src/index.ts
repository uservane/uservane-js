"use client";

/**
 * @uservane/openai-agents - client surface for OpenAI Agents SDK hosts.
 *
 * Re-exports the shared React UI (`UserVaneProvider`, `InlineFeedback`,
 * `useUserVane`) from `@uservane/agent-react` and the headless controller from
 * `@uservane/agent-core`. No secret-key path lives here.
 *
 * Server helpers (fire-once run wrapper + mint):
 *   `import { runWithFeedback, mintFeedbackToken } from "@uservane/openai-agents/server"`
 *
 * Langfuse session bridge (customer server only):
 *   `import { installLangfuseBridge } from "@uservane/openai-agents/langfuse"`
 *
 * Client flow matches Vercel: after the server mints a bound token, call
 * `controller.bind({ surveyId, showToken, sessionId })` then `resolveTask`
 * at true resolution. Set `groupId` on the Agents run to your session id so
 * the mint, the Langfuse session, and the pending score share one key.
 *
 * v1 targets chat-UI agents (a browser renders the conversation). Headless
 * or voice-only agents without a render surface are out of scope.
 */

export type {
  ActiveAsk,
  AgentControllerDeps,
  AgentControllerListener,
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
export {
  __resetAnonMemoryForTests,
  __resetInitGuardForTests,
  AgentController,
  emptyCorrelationSource,
  explicitCorrelationSource,
  hasAnyCorrelationId,
  unlinkReason,
} from "@uservane/agent-core";

export type {
  InlineFeedbackProps,
  UserVaneContextValue,
  UserVaneProviderProps,
  UseUserVaneResult,
} from "@uservane/agent-react";
export {
  __getControllerForTests,
  __resetControllerForTests,
  InlineFeedback,
  UserVaneErrorBoundary,
  UserVaneProvider,
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
