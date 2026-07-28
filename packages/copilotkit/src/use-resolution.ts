"use client";

/**
 * Deterministic turn-resolution for CopilotKit hosts.
 *
 * Symbols used (verified against @copilotkit/react-core@1.63.2 installed d.ts +
 * runtime source, 2026-07-27):
 *
 * v1 (default):
 * - `useCopilotContext()` -> `threadId`
 * - `useCopilotChatInternal({ onStopGeneration })` -> `isLoading`,
 *   `stopGeneration`, `messages` (AG-UI `{ role, id }`), `interrupt`, `agent`
 *   WHY Internal: the slim `useCopilotChat()` wrapper destructures
 *   `visibleMessages`, but the internal return in 1.63.2 exposes AG-UI
 *   `messages` (not `visibleMessages`). Internal is a public package export.
 *   Stop signal is `stopGeneration` (not `stop`). `interrupt` is HITL UI
 *   content (string | ReactElement | null), not a stop function. We also
 *   wrap `agent.abortRun` so a sibling CopilotChat stop button suppresses.
 *
 * Resolution fires ONCE per turn on isLoading true->false, deduped by latest
 * assistant message id, suppressed when stopGeneration/abort or a HITL
 * interrupt ended the turn.
 *
 * v2 note: CopilotKit's v2 `useAgent` path is deliberately NOT wired here yet -
 * @copilotkit/react-ui@1.63 ships no importable v2 in-transcript UI to pair
 * with it, and the v2 view's stop routes through `copilotkit.stopAgent` (not
 * only `agent.abortRun`), which this suppression does not cover. Add v2 as a
 * follow-up when the v2 UI + stop path stabilize, with its own tests. Shipping
 * a nonfunctional v2 surface now would be an unbuilt feature.
 */

import { useCopilotChatInternal, useCopilotContext } from "@copilotkit/react-core";
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  type ChatMessageLike,
  evaluateResolutionEdge,
  latestAssistantMessageId,
} from "./resolution.js";

export type ResolutionInfo = {
  /** CopilotKit thread id (= UserVane sessionId when bound). */
  threadId: string | undefined;
  /** Dedup key (assistant message id or synthetic turn:N). */
  fireKey: string;
  /** Latest assistant message id when available. */
  messageId: string | undefined;
  /**
   * True when threadId was absent at resolution. Capture may still run on the
   * unbound path; linked Langfuse correlation requires threadId.
   */
  unbound: boolean;
  /** Human-readable flag when unbound. */
  reason?: string;
};

export type UseUserVaneCopilotResolutionOptions = {
  /** Called exactly once per genuine resolved turn. */
  onResolve?: (info: ResolutionInfo) => void;
};

export type UseUserVaneCopilotResolutionResult = {
  threadId: string | undefined;
  isLoading: boolean;
  /** Latest assistant message id from the current transcript (if any). */
  latestMessageId: string | undefined;
  /** Dedup keys already fired this mount lifetime. */
  firedKeys: ReadonlySet<string>;
  /**
   * Stop the in-flight generation and mark the turn suppressed so the
   * subsequent isLoading true->false edge does not capture feedback.
   * Prefer this over calling CopilotKit's stopGeneration directly when you
   * own the stop control; the default CopilotChat stop button also aborts the
   * shared agent (we detect that via onStopGeneration when it routes through
   * our hook instance, and via a cleared success path otherwise).
   */
  stopGeneration: () => void;
};

type AgentLike = {
  isRunning?: boolean;
  messages?: readonly ChatMessageLike[];
  abortRun?: () => void;
};

/**
 * When CopilotChat's own stop button aborts the shared agent, it calls
 * `agent.abortRun()` (not our onStopGeneration). We install ONE wrapper per
 * agent (guarded so a sibling instance / re-mount does not double-wrap) that
 * notifies every mounted resolution instance to suppress the turn. This
 * registry lets multiple mounted instances all suppress while the wrapper
 * exists, and lets cleanup restore the exact original (delete if it was not an
 * own property) without leaving a stale bound wrapper behind.
 */
const abortSuppressors = new Set<() => void>();
function notifyAbortSuppressors(): void {
  for (const suppress of abortSuppressors) suppress();
}
type PatchedAbort = (() => void) & { __uvPatched?: boolean };

/**
 * Subscribe to CopilotKit turn resolution (isLoading true->false edge).
 * Does NOT mint tokens or call the network - the host wires bind/resolveTask.
 */
export function useUserVaneCopilotResolution(
  options: UseUserVaneCopilotResolutionOptions = {},
): UseUserVaneCopilotResolutionResult {
  const onResolveRef = useRef(options.onResolve);
  onResolveRef.current = options.onResolve;

  const { threadId: contextThreadId } = useCopilotContext();

  // --- v1 path: useCopilotChatInternal (public export) ---
  const suppressedRef = useRef(false);
  const markSuppressed = useCallback(() => {
    suppressedRef.current = true;
  }, []);

  const chat = useCopilotChatInternal({
    onStopGeneration: () => {
      markSuppressed();
    },
  });

  // Patch shared agent.abortRun so CopilotChat's stop button (a separate
  // useCopilotChatInternal instance) still marks the turn suppressed. That UI
  // path calls agent.abortRun() without our onStopGeneration callback.
  const agent = chat.agent as AgentLike | undefined;
  // Every mounted instance registers its suppressor; the single per-agent
  // wrapper notifies all of them, so multiple widgets all suppress on a stop.
  useEffect(() => {
    abortSuppressors.add(markSuppressed);
    return () => {
      abortSuppressors.delete(markSuppressed);
    };
  }, [markSuppressed]);
  useEffect(() => {
    if (!agent || typeof agent.abortRun !== "function") return;
    const current = agent.abortRun as PatchedAbort;
    if (current.__uvPatched) return; // already wrapped for this agent (sibling / re-mount)
    const hadOwn = Object.hasOwn(agent, "abortRun");
    const original = current;
    const wrapped: PatchedAbort = () => {
      notifyAbortSuppressors();
      return original.call(agent);
    };
    wrapped.__uvPatched = true;
    agent.abortRun = wrapped;
    return () => {
      // Only unwrap if we still own it (a newer patch may have replaced it);
      // restore the exact original, or remove our own-prop to re-expose the
      // prototype method - never leave a stale bound wrapper behind.
      if (agent.abortRun !== wrapped) return;
      if (hadOwn) {
        agent.abortRun = original;
      } else {
        delete (agent as { abortRun?: () => void }).abortRun;
      }
    };
  }, [agent]);

  const v1IsLoading = Boolean(chat.isLoading);
  const v1Messages = (chat.messages ?? []) as readonly ChatMessageLike[];
  // Prefer context threadId; Internal also exposes threadId when present.
  const threadId =
    (typeof contextThreadId === "string" && contextThreadId.length > 0
      ? contextThreadId
      : undefined) ??
    (typeof chat.threadId === "string" && chat.threadId.length > 0 ? chat.threadId : undefined);

  const stopGeneration = useCallback(() => {
    markSuppressed();
    chat.stopGeneration();
  }, [chat, markSuppressed]);

  // HITL interrupt content: when non-null at the loading edge, not a genuine
  // resolution (agent is waiting for human input).
  const interruptActive = chat.interrupt != null;

  return useResolutionEngine({
    isLoading: v1IsLoading,
    messages: v1Messages,
    threadId,
    suppressedRef,
    interruptActive,
    stopGeneration,
    onResolveRef,
  });
}

type EngineArgs = {
  isLoading: boolean;
  messages: readonly ChatMessageLike[];
  threadId: string | undefined;
  suppressedRef: MutableRefObject<boolean>;
  interruptActive: boolean;
  stopGeneration: () => void;
  onResolveRef: MutableRefObject<((info: ResolutionInfo) => void) | undefined>;
};

function useResolutionEngine({
  isLoading,
  messages,
  threadId,
  suppressedRef,
  interruptActive,
  stopGeneration,
  onResolveRef,
}: EngineArgs): UseUserVaneCopilotResolutionResult {
  const wasLoadingRef = useRef(false);
  const firedRef = useRef<Set<string>>(new Set());
  const turnCounterRef = useRef(0);
  // Snapshot fired set for consumers (state so re-renders see updates in tests).
  const [firedKeys, setFiredKeys] = useState<ReadonlySet<string>>(() => new Set());

  // Reset suppression at the start of a new generation so a prior stop does
  // not poison a later successful turn.
  useEffect(() => {
    if (isLoading) {
      suppressedRef.current = false;
    }
  }, [isLoading, suppressedRef]);

  useEffect(() => {
    const suppressed = suppressedRef.current || interruptActive;
    const result = evaluateResolutionEdge({
      isLoading,
      wasLoading: wasLoadingRef.current,
      suppressed,
      messages,
      alreadyFired: firedRef.current,
      turnCounter: turnCounterRef.current,
    });

    wasLoadingRef.current = result.nextWasLoading;
    turnCounterRef.current = result.nextTurnCounter;

    if (!result.fire || !result.fireKey) {
      // Clear suppress flag after a suppressed edge so the next turn is clean.
      if (result.reason === "suppressed") {
        suppressedRef.current = false;
      }
      return;
    }

    firedRef.current.add(result.fireKey);
    setFiredKeys(new Set(firedRef.current));
    suppressedRef.current = false;

    const unbound = !(typeof threadId === "string" && threadId.length > 0);
    const info: ResolutionInfo = {
      threadId,
      fireKey: result.fireKey,
      messageId: latestAssistantMessageId(messages),
      unbound,
      ...(unbound
        ? {
            reason:
              "threadId absent: capture is unbound. Set <CopilotKit threadId={...}> (and mint with sessionId=threadId) for a linked round-trip.",
          }
        : {}),
    };
    onResolveRef.current?.(info);
  }, [isLoading, messages, threadId, interruptActive, suppressedRef, onResolveRef]);

  return {
    threadId,
    isLoading,
    latestMessageId: latestAssistantMessageId(messages),
    firedKeys,
    stopGeneration,
  };
}
