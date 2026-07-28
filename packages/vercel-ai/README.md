# `@uservane/vercel-ai`

Agent-native UserVane capture for Vercel AI SDK hosts.

Thin positioning shim over `@uservane/agent-core` + `@uservane/agent-react`.
Public API is identical to earlier releases: same exports, same client/server
split. Headless logic lives in agent-core; React UI in agent-react.

## Install

```bash
pnpm add @uservane/vercel-ai
# peers: ai >= 3, react >= 18
```

## Client

```tsx
import { UserVaneProvider, useUserVane } from "@uservane/vercel-ai";

<UserVaneProvider apiKey="uv_pk_live_..." surveySlug="post-task">
  <Chat />
</UserVaneProvider>
```

## Server

```ts
import { mintFeedbackToken } from "@uservane/vercel-ai/server";
import { propagateAttributes } from "@langfuse/tracing";

const sessionId = crypto.randomUUID();
await propagateAttributes({ sessionId }, async () => {
  const result = await generateText({ /* ... */ });
  const { tokens } = await mintFeedbackToken({
    secretKey: process.env.USERVANE_SECRET_KEY!,
    respondentId: userId,
    sessionId,
    surveyId: "surv_post_task",
  });
  // thread tokens + sessionId to client -> controller.bind()
});
```

Do not import `/server` from client code (secret key must stay server-side).
