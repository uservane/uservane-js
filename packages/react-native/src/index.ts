/**
 * @uservane/react-native - UserVane React Native SDK.
 *
 * Reuses the platform-agnostic core from `@uservane/browser` (client,
 * show-decision, sampling, scale, types). The only new surface is the RN
 * renderer (View / Text / Pressable) plus provider, hook, and error boundary.
 *
 * ```tsx
 * import { UserVaneProvider, useUserVane } from "@uservane/react-native";
 *
 * <UserVaneProvider apiKey="uv_pk_live_...">
 *   <App />
 * </UserVaneProvider>
 *
 * const { survey, identify } = useUserVane();
 * identify({ userId: "u_123" });
 * survey("nps-q1");
 * ```
 */

// Re-export shared types so consumers need one import surface.
export type {
  BootstrapResponse,
  Corner,
  IdentifyOptions,
  InitOptions,
  Presentation,
  SurveyDefinition,
  SurveyType,
} from "@uservane/browser";

export type { UserVaneContextValue } from "./context.js";
export { NativeController } from "./controller.js";
export { UserVaneErrorBoundary } from "./error-boundary.js";
export type { UserVaneProviderProps } from "./provider.js";
export {
  __getControllerForTests,
  __resetControllerForTests,
  UserVaneProvider,
} from "./provider.js";
export type { RatingScaleProps } from "./rating.js";
export { RatingScale } from "./rating.js";
export type { SurveyCardProps, SurveyPhase } from "./survey-card.js";
export { SurveyCard } from "./survey-card.js";
export type { ActiveSurvey, SurveyCompleteResult } from "./types.js";
export type { UseUserVaneResult } from "./use-user-vane.js";
export { useUserVane } from "./use-user-vane.js";
