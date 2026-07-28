/**
 * @uservane/vercel-ai/server - server-only helpers for agent-native capture.
 *
 * Re-exports mintFeedbackToken from @uservane/agent-core/server.
 *
 * SECURITY: This module MUST run only on the customer's server (Next.js route
 * handler / server action / edge function). It accepts the project SECRET key
 * and POSTs to /v1/sdk/tokens. Never import this entry from client components
 * or ship the secret key to the browser.
 *
 * Correlation model (verified, 2026-07-27):
 * - Langfuse + Vercel AI SDK: the developer controls sessionId via
 *   propagateAttributes({ sessionId }, () => generateText(...)).
 *   The trace id is auto-generated; we do NOT auto-read it.
 * - Langfuse accepts session-level scores (sessionId alone).
 * - Therefore: mint a token bound to the same sessionId the server already
 *   set for Langfuse, then thread the showToken + sessionId to the client.
 *
 * @example
 * ```ts
 * // app/api/chat/route.ts (server)
 * import { mintFeedbackToken } from "@uservane/vercel-ai/server";
 * import { propagateAttributes } from "@langfuse/tracing";
 *
 * const sessionId = crypto.randomUUID();
 * await propagateAttributes({ sessionId }, async () => {
 *   const result = await generateText({ ... });
 *   const { tokens } = await mintFeedbackToken({
 *     secretKey: process.env.USERVANE_SECRET_KEY!,
 *     respondentId: userId,
 *     sessionId,
 *     surveyId: "surv_post_task",
 *   });
 *   // stream tokens[surveyId] + sessionId to the client; client calls bind()
 * });
 * ```
 */

export {
  type MintDeferredAskLinkInput,
  type MintDeferredAskLinkResult,
  type MintFeedbackTokenError,
  type MintFeedbackTokenInput,
  type MintFeedbackTokenResult,
  mintDeferredAskLink,
  mintFeedbackToken,
} from "@uservane/agent-core/server";
