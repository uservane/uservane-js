/**
 * Correlation capture seam for agent-native feedback.
 *
 * Correlation ids are developer-provided: the customer's server mints a
 * bound show-token via `@uservane/agent-core/server` `mintFeedbackToken`
 * (secret-key authed POST /v1/sdk/tokens) using the same sessionId (and
 * optional traceId/observationId) it uses for Langfuse, then threads the
 * token + ids to the client which calls `controller.bind(...)`.
 *
 * Verified external facts (2026-07-27):
 * - Langfuse accepts session-level scores with sessionId alone
 *   (langfuse.com/docs/scores/custom).
 * - Observation-level scores need both traceId + observationId (ScoreBody).
 * - Framework adapters choose how sessionId is sourced (Vercel: propagateAttributes;
 *   OpenAI Agents: groupId).
 *
 * Observation-level scores ARE supported via developer-provided
 * `traceId` + `observationId`. Only the framework auto-READ of those ids
 * remains deferred (NEEDS CEO VERIFICATION). Do not auto-read AI-SDK / OTel /
 * Agents telemetry here.
 */

import type { CorrelationSnapshot, CorrelationSource } from "./types.js";

/** Default source: no ids -> response stored `unlinked` with reason. */
export const emptyCorrelationSource: CorrelationSource = {
  capture(): CorrelationSnapshot {
    return {};
  },
};

/**
 * Build a CorrelationSource from explicit server-provided ids (the bind path).
 * Prefer controller.bind() which also installs the bound show-token.
 */
export function explicitCorrelationSource(snapshot: CorrelationSnapshot): CorrelationSource {
  const frozen: CorrelationSnapshot = { ...snapshot };
  return {
    capture(): CorrelationSnapshot {
      return { ...frozen };
    },
  };
}

export function hasAnyCorrelationId(c: CorrelationSnapshot): boolean {
  return Boolean(c.sessionId || c.observationId || c.traceId);
}

export function unlinkReason(c: CorrelationSnapshot): string {
  if (hasAnyCorrelationId(c)) {
    return "ids-present-awaiting-token-attest";
  }
  return "no-correlation-source";
}
