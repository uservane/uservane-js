/**
 * OpenAI Agents SDK tool wrapper for request_user_feedback.
 *
 * Verified against installed `@openai/agents@0.13.5` types
 * (`@openai/agents-core` tool.d.ts):
 *   tool({ name?, description, parameters, execute })
 * parameters: JsonObjectSchema | ZodObjectLike | undefined
 *
 * Execute delegates to framework-agnostic handleRequestUserFeedback.
 * Requires peer `@openai/agents`. Never imports the secret-key server path.
 */

import { tool } from "@openai/agents";
import {
  type AgentController,
  handleRequestUserFeedback,
  REQUEST_USER_FEEDBACK_DESCRIPTION,
  REQUEST_USER_FEEDBACK_NAME,
  type RequestUserFeedbackArgs,
  type RequestUserFeedbackResult,
  requestUserFeedbackDescriptor,
} from "@uservane/agent-core";

export type { RequestUserFeedbackArgs, RequestUserFeedbackResult };

/**
 * Strict JSON schema (JsonObjectSchemaStrict): empty properties keeps the tool
 * zero-arg from the model's view; survey slug comes from controller.init.
 * No Zod dependency required.
 */
const parametersSchema = {
  type: "object" as const,
  properties: {} as Record<string, never>,
  required: [] as string[],
  additionalProperties: false as const,
};

/**
 * Build an OpenAI Agents `tool()` for in-conversation feedback.
 *
 * Only effective when the issuer minted with allowModelRequested (amr) and
 * bound the token. Refuses while a task is open; never throws into the loop.
 *
 * @example
 * ```ts
 * import { createRequestUserFeedbackTool } from "@uservane/openai-agents";
 * import { Agent } from "@openai/agents";
 *
 * const agent = new Agent({
 *   name: "Support",
 *   tools: [createRequestUserFeedbackTool(controller)],
 * });
 * ```
 */
export function createRequestUserFeedbackTool(controller: AgentController) {
  return tool({
    name: REQUEST_USER_FEEDBACK_NAME,
    description: REQUEST_USER_FEEDBACK_DESCRIPTION,
    parameters: parametersSchema,
    execute: async (input): Promise<RequestUserFeedbackResult> => {
      // Empty schema: ignore model input; controller holds surveySlug.
      void input;
      return handleRequestUserFeedback(controller);
    },
  });
}

/** Re-export framework-agnostic descriptor for hosts that register tools manually. */
export {
  REQUEST_USER_FEEDBACK_DESCRIPTION,
  REQUEST_USER_FEEDBACK_NAME,
  requestUserFeedbackDescriptor,
};
