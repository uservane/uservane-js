# `@uservane/openai-agents`

Agent-native UserVane capture for the [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/) (JS/TS).

There is **no official Langfuse JS integration for `@openai/agents`**. This package
ships a scoped session-guarantee bridge so feedback and session scores have a
Langfuse session to land on. It is **not** a full agent tracer.

## What you get

1. **Server fire-once run wrapper** (`/server`) - awaits true run resolution
   (the `run()` promise / `result.completed` when streaming), mints a session-bound
   show-token once, and returns `{ finalOutput, feedback }` for the client.
2. **Client React UI** - re-exports `UserVaneProvider`, `InlineFeedback`,
   `useUserVane` from `@uservane/agent-react` (same bind + resolveTask flow as Vercel).
3. **Langfuse trace-bridge** (`/langfuse`) - scoped processor that writes a
   Langfuse trace with `sessionId = groupId` so the session exists for
   `@uservane/langfuse-push` session scores.

## Install

```bash
pnpm add @uservane/openai-agents @openai/agents
# peer: react >= 18 for the client UI
```

## Server: capture at true resolution

```ts
import { runWithFeedback } from "@uservane/openai-agents/server";
import { Agent, Runner } from "@openai/agents";

const groupId = sessionId; // your chat session id

const { finalOutput, feedback } = await runWithFeedback(agent, input, {
  secretKey: process.env.USERVANE_SECRET_KEY!, // uv_sk_... server only
  respondentId: userId,
  surveyId: "surv_post_task",
  groupId,
  runner: new Runner({ groupId }),
});

// Thread feedback.showToken + feedback.sessionId to the client.
// Client: controller.bind({ surveyId, showToken, sessionId }) then resolveTask.
```

### Fire-once rules

- Resolution = the awaited `run()` result (or `await result.completed` when streaming).
- **Not** `agent_end` / per-agent hooks (those fire once per agent across handoffs).
- Deduped per result object: a second mint call for the same result is a no-op.

### Set `groupId`

`groupId` is the Agents SDK session grouping key (`new Runner({ groupId })` or
`run(..., { groupId })`). Map it to your chat session id. Without `groupId`,
mint is skipped and feedback is flagged unbound - set it for a linked round-trip.

## Client

```tsx
import { UserVaneProvider, useUserVane } from "@uservane/openai-agents";

<UserVaneProvider apiKey="uv_pk_live_..." surveySlug="post-task">
  <Chat />
</UserVaneProvider>

// after server mints:
const { bind, resolveTask } = useUserVane();
bind({ surveyId, showToken, sessionId });
resolveTask({ outcome: "done" });
```

No secret key (`uv_sk_`) is reachable from the client entry.

## Langfuse bridge (customer server)

```ts
import { installLangfuseBridge } from "@uservane/openai-agents/langfuse";

await installLangfuseBridge({
  langfuse: {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
  },
});
// then run agents with a Runner constructed with { groupId: yourSessionId }
```

**Set `groupId` on a `Runner`, not on `run()`.** The Agents trace group id lives on
`RunConfig` (the `Runner` constructor); it is silently ignored if passed to a per-call
`run()`. `runWithFeedback` constructs a `Runner({ groupId })` for you on the default
path; if you pass your own `runner`, construct it with `groupId` or the Langfuse session
will not form.

**Scope boundary:** the bridge GUARANTEES the Langfuse session exists (`sessionId =
groupId`, plus the trace name and any `RunConfig.traceMetadata` you set), so the
`uservane.satisfaction` session-score has a home. It does NOT capture the agent's
input / output / latency or a full tool / handoff / realtime tree - the `@openai/agents`
`Trace` carries no I/O fields. Use your agent framework's own tracer for that. Delivery
is confirmed with `flush(cb)`, not `flushAsync()` (which swallows failures).

Langfuse keys stay on the customer's server. UserVane never sees them. Pair with
`@uservane/langfuse-push` to push `uservane.satisfaction` session scores.

## Out of scope (v1)

- Headless / voice-only agents with no browser render surface.
- Full-fidelity Agents tracing in Langfuse.
- Observation-level auto-read (deferred).
