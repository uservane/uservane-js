"use client";

/**
 * @uservane/agent-react - shared React UI for agent-native UserVane capture.
 *
 * `<UserVaneProvider>`, `<InlineFeedback/>`, `useUserVane`. Built on
 * `@uservane/agent-core`. Framework adapters re-export this surface.
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

export type { UserVaneContextValue } from "./context.js";
export { UserVaneErrorBoundary } from "./error-boundary.js";
export { InlineFeedback, type InlineFeedbackProps } from "./inline-feedback.js";
export {
  __getControllerForTests,
  __resetControllerForTests,
  UserVaneProvider,
  type UserVaneProviderProps,
} from "./provider.js";
export type { UseUserVaneResult } from "./use-user-vane.js";
export { useUserVane } from "./use-user-vane.js";
