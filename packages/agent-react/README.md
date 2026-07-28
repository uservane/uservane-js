# `@uservane/agent-react`

Shared React UI for UserVane agent-native capture: provider, inline feedback,
and hooks. Depends on `@uservane/agent-core`. Framework adapters re-export these
components so hosts do not need to pick the React package separately.

## Install

```bash
pnpm add @uservane/agent-react
# peer: react >= 18
```

## Usage

```tsx
import { UserVaneProvider, useUserVane, InlineFeedback } from "@uservane/agent-react";

export function ChatShell() {
  return (
    <UserVaneProvider apiKey="uv_pk_live_..." surveySlug="post-task">
      <Chat />
    </UserVaneProvider>
  );
}

function Chat() {
  const { resolveTask, bind, controller } = useUserVane();
  // after server mints a bound token:
  // bind({ surveyId, showToken, sessionId });
  // at true resolution:
  // resolveTask({ outcome: "done" });
  return <InlineFeedback controller={controller} />;
}
```

v1 targets chat-UI agents where a browser renders the conversation. Headless
or voice-only agents (no render surface) are out of scope for this package.
