# `@uservane/agent-core`

Framework-agnostic headless core for UserVane agent-native capture.

This package holds the controller, correlation seam, anonymous keys, types, and
the server-only `mintFeedbackToken` helper. Framework adapters
(`@uservane/vercel-ai`, `@uservane/openai-agents`) re-export it and stay thin.

## Install

```bash
pnpm add @uservane/agent-core
```

## Client (headless)

```ts
import { AgentController } from "@uservane/agent-core";

const controller = new AgentController();
controller.init({ key: "uv_pk_live_...", surveySlug: "post-task" });
controller.identify({ userId: "u_123" });

// After the server mints a bound token and you thread it down:
controller.bind({ surveyId, showToken, sessionId });

// At true task resolution:
controller.resolveTask({ outcome: "refunded" });

// Off-platform / async resolution: close the task without an in-session ask.
controller.resolveTask({ defer: true, outcome: "refund_pending" });
// later, when confirmed: mintDeferredAskLink on the server and deliver the URL.
```

## Agent tool (`request_user_feedback`)

Off by default. Issuer must mint with `allowModelRequested: true` (bakes `amr`
into the show-token). The model cannot self-enable. Captures are stored as
`identity_kind=model-requested` and are headline-excluded. Never fires while a
task is open.

```ts
import { handleRequestUserFeedback } from "@uservane/agent-core";
// or adapter wrappers:
// createRequestUserFeedbackTool(controller) from @uservane/vercel-ai
// createRequestUserFeedbackTool(controller) from @uservane/openai-agents

const result = handleRequestUserFeedback(controller);
// { ok: true, status: "feedback_requested", ... } | { ok: false, status: "task_open"|"not_enabled"|... }
```

## Server (secret key)

```ts
import { mintFeedbackToken, mintDeferredAskLink } from "@uservane/agent-core/server";

const { tokens } = await mintFeedbackToken({
  secretKey: process.env.USERVANE_SECRET_KEY!, // uv_sk_... - NEVER ship to the browser
  respondentId: userId,
  sessionId, // same id you use for Langfuse session / agent groupId
  surveyId: "surv_post_task",
  // Optional: enable the model-requested agent tool for this token (self-selection;
  // those captures are headline-excluded).
  // allowModelRequested: true,
});

// Out-of-band ask after async outcome (e.g. refund days later).
// Last-mile contract (your channel): one ask, correct outcome, no double-send.
// UserVane does not send email/SMS; enforcement ends where your channel begins.
const deferred = await mintDeferredAskLink({
  secretKey: process.env.USERVANE_SECRET_KEY!,
  respondentId: userId,
  surveyId: "surv_post_task",
  sessionId,
});
// Two modes:
//  - deferred.url: a hosted ask link for your channel (email). STANDALONE capture,
//    NOT correlated to the agent session.
//  - deferred.showToken + deferred.sessionId: the SESSION-LINKED path. Thread them to
//    the user's next in-app session and controller.bind({ surveyId, showToken, sessionId })
//    so the deferred capture links and round-trips a Langfuse session score.
// (A session-linked ask via the emailed URL is a planned follow-up.)
```

## What this is not

- Not a React UI (see `@uservane/agent-react`).
- Not a framework adapter (see `@uservane/vercel-ai` / `@uservane/openai-agents`).
- Not an email/SMS sender (deferAsk reuses your channel).
- Observation-level auto-read of AI SDK / OTel trace ids is deferred.
