# `@uservane/copilotkit`

Frontend UserVane capture for [CopilotKit](https://docs.copilotkit.ai/).

CopilotKit is a **frontend** framework. Agent execution and Langfuse tracing live
on the customer's **backend** (LangGraph, CrewAI, Mastra, or any AG-UI agent)
over AG-UI. This package is frontend-only: it captures feedback at deterministic
turn resolution and links by CopilotKit `threadId`. It does **not** ship a
Langfuse trace bridge (unlike `@uservane/openai-agents`). The backend owns
tracing; UserVane posts a session-level `uservane.satisfaction` score keyed by
`threadId` once the respondent answers.

## What you get

1. **`<UserVaneCopilotFeedback>`** - watches the chat loading edge, binds a
   server-minted token (`sessionId = threadId`), and calls `resolveTask` once
   per genuine turn. Renders `InlineFeedback` adjacent to your chat layout
   (you place the component; no in-transcript slot required).
2. **Server mint** (`/server`) - re-exports `mintFeedbackToken` from
   `@uservane/agent-core/server`. Mint with `sessionId = threadId`.
3. **Re-exports** - `UserVaneProvider`, `InlineFeedback`, `useUserVane` from
   `@uservane/agent-react` for a single import surface.

## Install

```bash
pnpm add @uservane/copilotkit @copilotkit/react-core
# peer: react >= 18
# pin CopilotKit >= 1.63 (threadId propagation bug in older versions, #2624)
```

## Server: mint with `sessionId = threadId`

```ts
// app/api/feedback-token/route.ts (server only)
import { mintFeedbackToken } from "@uservane/copilotkit/server";

const threadId = body.threadId; // same value as <CopilotKit threadId={...}>

const { tokens } = await mintFeedbackToken({
  secretKey: process.env.USERVANE_SECRET_KEY!, // uv_sk_... never to the client
  respondentId: userId,
  sessionId: threadId,
  surveyId: "surv_post_task",
});
// thread tokens[surveyId] + sessionId to the client
```

## Client: capture at turn resolution

```tsx
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import {
  UserVaneProvider,
  UserVaneCopilotFeedback,
} from "@uservane/copilotkit";

const threadId = "/* your stable chat thread id */";

export function SupportChat({ showToken }: { showToken: string }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" threadId={threadId}>
      <UserVaneProvider apiKey="uv_pk_live_..." surveySlug="post-task">
        <CopilotChat />
        {/* Place adjacent to the chat - not inside the transcript */}
        <UserVaneCopilotFeedback
          surveyId="surv_post_task"
          showToken={showToken}
          outcome="done"
        />
      </UserVaneProvider>
    </CopilotKit>
  );
}
```

### Resolution rules (deterministic)

- **Signal:** `isLoading` true to false (generation complete). This is the
  gated design principle: the resolution signal owns the sample, never a
  model-triggered tool (`useCopilotAction` / `useHumanInTheLoop` render paths
  are explicitly out of scope for capture).
- **Once per turn:** deduped by the latest assistant message id.
- **Suppressed** when the turn ended via `stopGeneration` (abort) or a HITL
  interrupt (agent waiting on a human, not a finished answer).
- **`sessionId = threadId`:** mint, bind, submit, and pending session scores
  share this key. Absent `threadId` => unbound capture (flagged).

No secret key (`uv_sk_`) is reachable from the client entry.

## Closing the Langfuse loop (backend owns traces)

UserVane does **not** trace the CopilotKit agent. Your backend agent framework
must set Langfuse `sessionId = threadId` on its own traces so the
`uservane.satisfaction` session score lands on the same session.

### LangGraph (cleanest: official Langfuse support)

Propagate the CopilotKit `threadId` into the LangGraph run and bind it as the
Langfuse session id (Python example):

```python
# Backend graph invoke - session_id must equal CopilotKit threadId
from langfuse.callback import CallbackHandler

langfuse_handler = CallbackHandler()
# Prefer the Langfuse/LangGraph integration you already use; the critical
# contract is session_id == thread_id from the frontend.
config = {
    "configurable": {"thread_id": thread_id},
    "callbacks": [langfuse_handler],
    "metadata": {"langfuse_session_id": thread_id},
}
graph.invoke(inputs, config=config)
```

With the official Langfuse LangGraph docs, set the session id to the same
`thread_id` CopilotKit already uses for the conversation so scores join traces.

### CrewAI / other backends

Same contract: when creating or updating the Langfuse trace/span for the run,
set `session_id` (or the SDK's session attribute) to the CopilotKit `threadId`
you received over AG-UI. Then run `@uservane/langfuse-push` (or your own
pending-scores consumer) so `uservane.satisfaction` posts as a **session-level**
score for that id.

## CopilotKit version

- **Peer:** `@copilotkit/react-core >= 1.63`
- Older versions had a threadId-not-forwarded-to-backend bug (#2624). Pin and
  verify `>=1.63`.
- Verified against **1.63.2**: loading edge via chat `isLoading` /
  `agent.isRunning`; stop via `stopGeneration` / `agent.abortRun`; messages
  for dedup via AG-UI `messages` (`useCopilotChatInternal`, a public export).
  The slim `useCopilotChat()` wrapper's `visibleMessages` field is absent on
  the internal return at runtime in 1.63.2 (d.ts still mentions it); this
  package uses the working public surface.

## Out of scope (v1)

- Model-triggered feedback tools (`useCopilotAction` / `useHumanInTheLoop`
  capture paths).
- In-transcript v2 UI slots (`CopilotChatMessageView` / `assistantMessage` as
  a package-import contract for capture). Not required: place
  `UserVaneCopilotFeedback` next to the chat.
- A Langfuse trace bridge for CopilotKit (backend owns tracing).
- Observation-level auto-read (deferred).
