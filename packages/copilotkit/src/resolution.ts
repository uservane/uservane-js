/**
 * Pure turn-resolution logic for CopilotKit hosts.
 *
 * Resolution signal: isLoading true -> false (generation complete).
 * Dedup: latest assistant message id (or a synthetic turn key).
 * Suppression: stopGeneration / abort / HITL interrupt (no genuine resolution).
 *
 * Kept free of React and CopilotKit imports so unit tests exercise the edge
 * without a live runtime.
 */

export type ChatMessageLike = {
  id?: string | null;
  role?: string | null;
  /** Legacy gql Message class shape (optional). */
  isTextMessage?: () => boolean;
};

export type ResolutionEdgeInput = {
  /** Current loading flag from useCopilotChat / agent.isRunning. */
  isLoading: boolean;
  /** Previous loading flag (ref-backed across renders). */
  wasLoading: boolean;
  /**
   * True when the in-flight turn was ended by stopGeneration/abort or a HITL
   * interrupt rather than a successful generation complete.
   */
  suppressed: boolean;
  /** Chat messages (AG-UI role/id shape or legacy visibleMessages). */
  messages: readonly ChatMessageLike[] | null | undefined;
  /** Message ids (or synthetic turn keys) already resolved this session. */
  alreadyFired: ReadonlySet<string>;
  /** Monotonic counter used when no assistant message id is available. */
  turnCounter: number;
};

export type ResolutionEdgeResult = {
  /** Whether capture should fire exactly once for this edge. */
  fire: boolean;
  /** Value to store as the next wasLoading. */
  nextWasLoading: boolean;
  /** Dedup key that was (or would be) recorded when fire is true. */
  fireKey?: string;
  /** Updated turn counter (incremented only when a synthetic key is minted). */
  nextTurnCounter: number;
  /** Why fire is false, when applicable. */
  reason?: "not-edge" | "suppressed" | "deduped";
};

/**
 * Latest assistant message id from a chat transcript (newest last).
 * Supports AG-UI `{ role, id }` and best-effort legacy shapes.
 */
export function latestAssistantMessageId(
  messages: readonly ChatMessageLike[] | null | undefined,
): string | undefined {
  if (!messages || messages.length === 0) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    const role = typeof m.role === "string" ? m.role.toLowerCase() : "";
    const isAssistant =
      role === "assistant" ||
      role === "ai" ||
      // Legacy TextMessage without role string: treat as non-assistant unless role says so.
      false;
    if (!isAssistant) continue;
    if (typeof m.id === "string" && m.id.length > 0) return m.id;
  }
  return undefined;
}

/**
 * Evaluate one render tick for a true->false isLoading edge.
 * Pure: no React, no network. Call from a hook after reading CopilotKit state.
 */
export function evaluateResolutionEdge(input: ResolutionEdgeInput): ResolutionEdgeResult {
  const nextWasLoading = input.isLoading;
  let nextTurnCounter = input.turnCounter;

  // Only the true -> false edge is a resolution candidate.
  if (!(input.wasLoading === true && input.isLoading === false)) {
    return { fire: false, nextWasLoading, nextTurnCounter, reason: "not-edge" };
  }

  if (input.suppressed) {
    return { fire: false, nextWasLoading, nextTurnCounter, reason: "suppressed" };
  }

  const messageId = latestAssistantMessageId(input.messages);
  let fireKey: string;
  if (messageId) {
    fireKey = messageId;
  } else {
    nextTurnCounter = input.turnCounter + 1;
    fireKey = `turn:${nextTurnCounter}`;
  }

  if (input.alreadyFired.has(fireKey)) {
    return {
      fire: false,
      nextWasLoading,
      fireKey,
      nextTurnCounter,
      reason: "deduped",
    };
  }

  return { fire: true, nextWasLoading, fireKey, nextTurnCounter };
}
