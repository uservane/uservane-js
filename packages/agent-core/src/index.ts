/**
 * @uservane/agent-core - framework-agnostic headless agent capture.
 *
 * DOM-free controller, correlation seam, anonymous keys, and types.
 * Adapters (`@uservane/vercel-ai`, `@uservane/openai-agents`, ...) re-export
 * this surface and add framework-specific wiring.
 *
 * Server mint lives at `@uservane/agent-core/server` (secret key; never client).
 */

export type {
  BootstrapResponse,
  Corner,
  InitOptions,
  Presentation,
  SurveyDefinition,
  SurveyType,
} from "@uservane/browser";

export { __resetAnonMemoryForTests } from "./anonymous-key.js";
export {
  AgentController,
  type AgentControllerDeps,
  type AgentControllerListener,
} from "./controller.js";
export {
  emptyCorrelationSource,
  explicitCorrelationSource,
  hasAnyCorrelationId,
  unlinkReason,
} from "./correlation.js";
/** @internal - once-guard for React provider StrictMode; test-only reset. */
export {
  __resetInitGuardForTests,
  markInitCalled,
  wasInitCalled,
} from "./init-guard.js";
export {
  handleRequestUserFeedback,
  REQUEST_USER_FEEDBACK_DESCRIPTION,
  REQUEST_USER_FEEDBACK_NAME,
  type RequestUserFeedbackArgs,
  type RequestUserFeedbackResult,
  requestUserFeedbackDescriptor,
} from "./request-user-feedback.js";
export { readShowTokenPayload, tokenAttestsModelRequested } from "./show-token-payload.js";
export type {
  ActiveAsk,
  AgentIdentifyOptions,
  AgentInitOptions,
  BoundTokenBinding,
  CompleteOptions,
  CorrelationSnapshot,
  CorrelationSource,
  HeadlessContract,
  IdentityKind,
  ResolveTaskOptions,
} from "./types.js";
