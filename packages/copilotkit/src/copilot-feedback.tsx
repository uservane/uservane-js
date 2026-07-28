"use client";

/**
 * Non-intrusive CopilotKit feedback surface.
 *
 * Place adjacent to the chat in the host layout (not inside the transcript).
 * There is no importable v2 in-transcript slot in @copilotkit/react-ui@1.63.2
 * (CopilotChatMessageView / assistantMessage are not a package export path
 * hosts can depend on for capture).
 *
 * On each genuine turn resolution (isLoading true->false):
 * 1. bind({ surveyId, showToken, sessionId: threadId }) when token + threadId
 * 2. resolveTask({ outcome })
 * 3. InlineFeedback renders the active ask from the shared controller
 */

import { InlineFeedback, useUserVane } from "@uservane/agent-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { type ResolutionInfo, useUserVaneCopilotResolution } from "./use-resolution.js";

export type UserVaneCopilotFeedbackProps = {
  /** Survey the server minted a bound token for. */
  surveyId: string;
  /**
   * Server-minted show-token (from mintFeedbackToken with sessionId=threadId).
   * Thread this from your server after mint. Absent => unbound bootstrap path.
   */
  showToken?: string;
  /** Optional outcome string for resolveTask (PM segmentation). */
  outcome?: string;
  /** Optional task type for resolveTask. */
  taskType?: string;
  debug?: boolean;
  /** Called after a genuine resolution is handled. */
  onResolved?: (info: ResolutionInfo) => void;
  /**
   * When true (default), render InlineFeedback under the resolution hook.
   * Set false if you place InlineFeedback yourself.
   */
  renderInline?: boolean;
  children?: ReactNode;
};

/**
 * Capture feedback at deterministic CopilotKit turn resolution.
 * Must sit under both `<CopilotKit>` and `<UserVaneProvider>`.
 */
export function UserVaneCopilotFeedback({
  surveyId,
  showToken,
  outcome,
  taskType,
  debug,
  onResolved,
  renderInline = true,
  children,
}: UserVaneCopilotFeedbackProps): ReactNode {
  const { controller, bind, resolveTask } = useUserVane();
  const showTokenRef = useRef(showToken);
  showTokenRef.current = showToken;
  const [lastUnbound, setLastUnbound] = useState(false);

  const handleResolve = useCallback(
    (info: ResolutionInfo) => {
      setLastUnbound(info.unbound);
      const token = showTokenRef.current;
      if (!info.unbound && typeof token === "string" && token.length > 0) {
        bind({
          surveyId,
          showToken: token,
          sessionId: info.threadId as string,
        });
      }
      resolveTask({
        ...(typeof outcome === "string" ? { outcome } : {}),
        ...(typeof taskType === "string" ? { taskType } : {}),
      });
      onResolved?.(info);
    },
    [bind, resolveTask, surveyId, outcome, taskType, onResolved],
  );

  useUserVaneCopilotResolution({ onResolve: handleResolve });

  return (
    <div data-uv-copilot-feedback data-unbound={lastUnbound ? "true" : "false"}>
      {children}
      {renderInline ? <InlineFeedback controller={controller} debug={debug} /> : null}
    </div>
  );
}
