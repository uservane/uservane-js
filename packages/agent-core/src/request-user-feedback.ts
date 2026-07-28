/**
 * Framework-agnostic handler for the request_user_feedback agent tool.
 *
 * Off by default (issuer must mint with allowModelRequested / amr).
 * Never fires while a task is open. Never throws into the agent loop.
 * Captures land as identity_kind=model-requested (headline-excluded).
 */

import type { AgentController } from "./controller.js";

export type RequestUserFeedbackArgs = {
  /** Override the controller's default survey slug. */
  surveySlug?: string;
  /** Optional short note for logs / model relay (not shown to the user). */
  reason?: string;
};

export type RequestUserFeedbackResult =
  | {
      ok: true;
      status: "feedback_requested";
      surveySlug: string;
      message: string;
    }
  | {
      ok: false;
      status: "task_open" | "not_enabled" | "no_survey" | "show_refused";
      message: string;
    };

/**
 * Request in-conversation feedback via the agent tool path.
 *
 * (a) Refuses when a task is open.
 * (b) Refuses when no bound token attests amr (issuer did not enable the tool).
 * (c) Otherwise triggers the ask with identityKind model-requested.
 *
 * Pure/testable: inject the controller. Never throws.
 */
export function handleRequestUserFeedback(
  controller: AgentController,
  args?: RequestUserFeedbackArgs,
): RequestUserFeedbackResult {
  try {
    if (controller.isTaskOpen()) {
      return {
        ok: false,
        status: "task_open",
        message: "not now: a task is in progress",
      };
    }

    if (!controller.allowsModelRequestedFeedback()) {
      return {
        ok: false,
        status: "not_enabled",
        message: "feedback tool not enabled",
      };
    }

    const slug =
      (typeof args?.surveySlug === "string" && args.surveySlug.length > 0
        ? args.surveySlug
        : null) ?? controller.getDefaultSurveySlug();

    if (!slug) {
      return {
        ok: false,
        status: "no_survey",
        message: "no survey configured for feedback",
      };
    }

    const shown = controller.requestModelFeedback(slug);
    if (!shown) {
      return {
        ok: false,
        status: "show_refused",
        message: "feedback ask was not shown",
      };
    }

    return {
      ok: true,
      status: "feedback_requested",
      surveySlug: slug,
      message: "feedback requested",
    };
  } catch {
    // Never throw into the agent loop.
    return {
      ok: false,
      status: "show_refused",
      message: "feedback ask failed",
    };
  }
}

/**
 * Neutral tool description for the model. Does not coax fishing for praise.
 * Use when registering the tool with a framework adapter.
 */
export const REQUEST_USER_FEEDBACK_DESCRIPTION =
  "Request a short in-conversation feedback survey from the user when they " +
  "express a reaction to the agent's work. Only call when the user has " +
  "indicated a reaction; do not solicit feedback unprompted. Refuses while " +
  "a task is in progress or when the host has not enabled this tool.";

/** Tool name exposed to agent frameworks. */
export const REQUEST_USER_FEEDBACK_NAME = "request_user_feedback";

/**
 * Framework-agnostic tool descriptor (name / description / empty params / handler).
 * Adapters wrap this into their framework's tool() shape.
 */
export const requestUserFeedbackDescriptor = {
  name: REQUEST_USER_FEEDBACK_NAME,
  description: REQUEST_USER_FEEDBACK_DESCRIPTION,
  /** JSON Schema for optional args (no required fields). */
  parameters: {
    type: "object" as const,
    properties: {
      surveySlug: {
        type: "string" as const,
        description: "Optional survey slug override for this ask",
      },
      reason: {
        type: "string" as const,
        description: "Optional short note about why feedback is being requested",
      },
    },
    additionalProperties: false as const,
  },
  handle: handleRequestUserFeedback,
};
