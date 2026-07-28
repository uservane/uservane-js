/**
 * Vercel AI SDK tool wrapper for request_user_feedback.
 *
 * Verified against installed `ai@7.0.37` types:
 *   tool({ description?, inputSchema, execute })  -- AI SDK 7 uses inputSchema
 *   (not the older `parameters` name from AI SDK 3/4).
 *
 * Execute delegates to framework-agnostic handleRequestUserFeedback.
 * Requires a peer `ai` package. Never imports the secret-key server path.
 */

import {
  type AgentController,
  handleRequestUserFeedback,
  REQUEST_USER_FEEDBACK_DESCRIPTION,
  REQUEST_USER_FEEDBACK_NAME,
  type RequestUserFeedbackArgs,
  type RequestUserFeedbackResult,
  requestUserFeedbackDescriptor,
} from "@uservane/agent-core";
import { jsonSchema, type Tool, tool } from "ai";

export type { RequestUserFeedbackArgs, RequestUserFeedbackResult };

/** Executable Vercel AI tool for request_user_feedback (portable return type). */
export type RequestUserFeedbackTool = Tool<RequestUserFeedbackArgs, RequestUserFeedbackResult>;

/**
 * Build a Vercel AI SDK tool that requests in-conversation feedback.
 *
 * The tool is only effective when the issuer minted a show-token with
 * allowModelRequested (amr) and bound it on the controller. While a task is
 * open the handler returns a structured "not now" result (never throws).
 *
 * @example
 * ```ts
 * import { createRequestUserFeedbackTool } from "@uservane/vercel-ai";
 * import { generateText } from "ai";
 *
 * const tools = {
 *   request_user_feedback: createRequestUserFeedbackTool(controller),
 * };
 * await generateText({ model, tools, ... });
 * ```
 */
export function createRequestUserFeedbackTool(
  controller: AgentController,
): RequestUserFeedbackTool {
  return tool({
    description: REQUEST_USER_FEEDBACK_DESCRIPTION,
    inputSchema: jsonSchema<RequestUserFeedbackArgs>({
      type: "object",
      properties: {
        surveySlug: {
          type: "string",
          description: "Optional survey slug override for this ask",
        },
        reason: {
          type: "string",
          description: "Optional short note about why feedback is being requested",
        },
      },
      additionalProperties: false,
    }),
    execute: async (input): Promise<RequestUserFeedbackResult> => {
      return handleRequestUserFeedback(controller, input ?? undefined);
    },
  });
}

/** Re-export framework-agnostic descriptor for hosts that register tools manually. */
export {
  REQUEST_USER_FEEDBACK_DESCRIPTION,
  REQUEST_USER_FEEDBACK_NAME,
  requestUserFeedbackDescriptor,
};
