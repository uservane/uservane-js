# UserVane + Vercel AI SDK example

Minimal [Next.js](https://nextjs.org) App Router chat that:

1. Streams a model reply with the [Vercel AI SDK](https://sdk.vercel.ai) v7 (`useChat`)
2. Mints a session-bound UserVane feedback token with `@uservane/vercel-ai/server`
3. Binds that token to the conversation, then calls `resolveTask` when the user
   marks the task done
4. Shows the inline feedback ask via `@uservane/vercel-ai`

This is the clone-and-run path for the agent-native wedge. Full docs:
[docs.uservane.com agent quickstart](https://docs.uservane.com/start/quickstart-agent/).

## Prerequisites

- Node 18+
- A free [UserVane](https://uservane.com) project with:
  - Publishable key (`uv_pk_…`)
  - Secret key (`uv_sk_…`, server only)
  - A survey with slug **`post-task`** (CSAT or CES works well)
- An OpenAI API key (or change the route to another AI SDK provider)

## Setup

```bash
git clone https://github.com/uservane/uservane-js.git
cd uservane-js/examples/vercel-ai-chat
cp .env.example .env.local
# edit .env.local with your keys
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Send a message, then click
**Mark task resolved** so feedback can appear (UserVane only asks after a real
outcome, not when the model merely finished generating).

Before you set any keys the page renders setup instructions instead of the chat,
so a fresh clone will not crash.

## How the session binding works

This is the part worth copying into your own app.

The `sessionId` is created **once per conversation, on the client**, and sent
with every request:

```ts
const [sessionId] = useState(() => crypto.randomUUID());
const [transport] = useState(
  () => new DefaultChatTransport({ api: "/api/chat", body: { sessionId } }),
);
```

The server binds the minted show-token to that same id, and refuses the request
if it is missing rather than inventing one. A guessed session id would attach the
score to the wrong conversation, which is worse than no score at all.

The binding travels back to the browser as **assistant message metadata**, which
is the AI SDK's supported channel for server-side data:

```ts
return result.toUIMessageStreamResponse({
  messageMetadata: ({ part }) =>
    part.type === "start" && binding ? { uservane: binding } : undefined,
});
```

The client reads `message.metadata.uservane` and calls `bind(...)` once. If you
also trace to Langfuse, use the same `sessionId` you pass to
`propagateAttributes`, and [`@uservane/langfuse-push`](https://www.npmjs.com/package/@uservane/langfuse-push)
will push the score onto that session.

## Honesty notes

- Do **not** put `USERVANE_SECRET_KEY` in any `NEXT_PUBLIC_*` variable.
- Call `resolveTask` only when the user's outcome is confirmed (here: the
  explicit button). Do not fire it on every token or tool return.
- A mint failure degrades to "no feedback ask" rather than breaking the chat.
- An empty `tokens` map means the respondent is suppressed (already answered, or
  asked too recently). That is expected, not an error.

## Files

| Path | Role |
|------|------|
| `app/page.tsx` | Client chat UI, session id, `bind` + `resolveTask` |
| `app/providers.tsx` | `UserVaneProvider` (renders the inline ask) |
| `app/api/chat/route.ts` | `streamText` + `mintFeedbackToken` + message metadata |
| `app/feedback-metadata.ts` | Shared metadata type for both sides |

## Versions

Built and verified against `ai@7`, `@ai-sdk/react@4`, `@ai-sdk/openai@4`,
`next@15`, and `@uservane/vercel-ai@0.1.3`. The UserVane SDK requires AI SDK v5
or newer.

## License

MIT (same as the rest of uservane-js).
