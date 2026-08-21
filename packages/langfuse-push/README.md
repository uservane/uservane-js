# `@uservane/langfuse-push`

Server-only adapter that completes the UserVane → Langfuse round-trip.

**Credential-safe by design.** This package runs in the **customer's** server or
cron. It holds the UserVane **secret** key (to poll the pending-scores queue) and
the Langfuse write keys. UserVane never receives, stores, or transmits the
Langfuse key and is never in the eval write path. Never import this package from
a client component or browser bundle.

## Install

```bash
npm install @uservane/langfuse-push
```

## Usage (customer server / cron)

```ts
import { pushPendingScores } from "@uservane/langfuse-push";

const summary = await pushPendingScores({
  uservane: {
    secretKey: process.env.USERVANE_SECRET_KEY!, // uv_sk_...
    // apiBase: "https://api.uservane.com", // default
  },
  langfuse: {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!, // sk-lf-...
    // baseUrl: "https://cloud.langfuse.com",
  },
  // scoreName: "uservane.satisfaction", // default, namespaced
  // includeFailed: true, // re-poll previously failed rows
});

// { delivered: number, failed: number }
console.log(summary);
```

## Behavior

1. `GET /v1/sdk/pending-scores` (secret-key authed) — linked + `score_state=pending`
   rows for **this project only** (verbatim PII).
2. For each row, create a Langfuse score via the official `langfuse` Node SDK
   with `name = uservane.satisfaction` (or `scoreName`), `value = rating`
   (0-10 raw) and `comment = text`, at whichever level the row supports:
   - **observation-level** when the row carries BOTH `traceId` and
     `observationId`;
   - otherwise **session-level**, keyed to `sessionId`.

   A row with neither a full observation pair nor a session id is acked as
   `failed` rather than pushed. We never write a half-id observation score,
   because a mislinked score is worse than a missing one.
3. `POST /v1/sdk/pending-scores/ack` with per-id `delivered` | `failed`.
4. The Langfuse SDK's own `fetchWithRetry` retries transient ingestion errors.
   A final failure is acked as `failed` and is re-pollable later with
   `includeFailed: true`.

Each score is created with a stable id derived from the UserVane score id, so a
re-push upserts instead of duplicating.

Unlinked rows are never in the queue and never pushed.

## Score create (verified)

Against installed `langfuse@3.38.20` / `langfuse-core` types:

- `Langfuse.score(body: CreateLangfuseScoreBody): this`
- `CreateLangfuseScoreBody` / `ScoreBody` includes optional `traceId`,
  `sessionId` and `observationId`. Session-only scores are supported
  (`sessionId` with no `traceId`); observation scores carry `traceId` +
  `observationId`.
- Confirm delivery with `flush(cb)`, **not** `flushAsync()`. Verified against
  `langfuse-core@3.38.20`: `flushAsync()` swallows an ingestion HTTP failure
  (it logs and resolves, never rejects), so it cannot tell a delivered score
  from a lost one. `flush(cb)` surfaces the final error as the callback's `err`
  argument, which is the only reliable delivery signal the SDK exposes.

See also: [Langfuse custom scores](https://langfuse.com/docs/scores/custom)
(session-level scores, checked 2026-07-27).
