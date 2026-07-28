"use client";

/**
 * @uservane/copilotkit - frontend capture for CopilotKit hosts.
 *
 * CopilotKit is a FRONTEND framework: agent execution and Langfuse tracing
 * live on the customer's BACKEND (LangGraph / CrewAI / Mastra / ...) over
 * AG-UI. This package captures feedback at deterministic turn resolution
 * (isLoading true->false) and links by CopilotKit threadId. It does NOT ship
 * a Langfuse trace bridge - the backend owns tracing.
 *
 * Client flow:
 * 1. Server: `import { mintFeedbackToken } from "@uservane/copilotkit/server"`
 *    with secret key + sessionId = threadId.
 * 2. Thread showToken + sessionId to the client.
 * 3. Client: wrap chat with UserVaneProvider + place UserVaneCopilotFeedback
 *    adjacent to the chat. On each genuine resolution it binds and resolveTask.
 *
 * No secret key (`uv_sk_`) is reachable from this entry.
 *
 * CopilotKit symbols used (verified @copilotkit/react-core@1.63.2):
 * - useCopilotContext (threadId), useCopilotChatInternal
 * - isLoading, stopGeneration, messages, interrupt, threadId, agent.abortRun
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
  UserVaneCopilotFeedback,
  type UserVaneCopilotFeedbackProps,
} from "./copilot-feedback.js";
export {
  type ChatMessageLike,
  evaluateResolutionEdge,
  latestAssistantMessageId,
  type ResolutionEdgeInput,
  type ResolutionEdgeResult,
} from "./resolution.js";
export {
  type ResolutionInfo,
  type UseUserVaneCopilotResolutionOptions,
  type UseUserVaneCopilotResolutionResult,
  useUserVaneCopilotResolution,
} from "./use-resolution.js";
