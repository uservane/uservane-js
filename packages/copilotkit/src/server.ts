/**
 * @uservane/copilotkit/server - server-only helpers for CopilotKit hosts.
 *
 * Re-exports mintFeedbackToken from @uservane/agent-core/server.
 *
 * SECURITY: This module MUST run only on the customer's server (Next.js route
 * handler / server action / edge function). It accepts the project SECRET key
 * and POSTs to /v1/sdk/tokens. Never import this entry from client components
 * or ship the secret key to the browser.
 *
 * Correlation model (CopilotKit is frontend-only):
 * - CopilotKit's threadId is the session key. Mint with sessionId = threadId.
 * - The customer's BACKEND agent framework (LangGraph / CrewAI / Mastra / ...)
 *   must set Langfuse sessionId = threadId on its own traces. UserVane does
 *   NOT ship a trace bridge here (unlike @uservane/openai-agents).
 *
 * @example
 * ```ts
 * // app/api/feedback-token/route.ts (server)
 * import { mintFeedbackToken } from "@uservane/copilotkit/server";
 *
 * const threadId = body.threadId; // same value as <CopilotKit threadId={...}>
 * const { tokens } = await mintFeedbackToken({
 *   secretKey: process.env.USERVANE_SECRET_KEY!,
 *   respondentId: userId,
 *   sessionId: threadId,
 *   surveyId: "surv_post_task",
 * });
 * // thread tokens[surveyId] + sessionId(=threadId) to the client for bind()
 * ```
 */

export {
  type MintFeedbackTokenError,
  type MintFeedbackTokenInput,
  type MintFeedbackTokenResult,
  mintFeedbackToken,
} from "@uservane/agent-core/server";
