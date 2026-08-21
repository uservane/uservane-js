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
- Delivery confirmation needs **both** SDK drain steps, not either one alone.
  Verified empirically against `langfuse@3.38.20` with a local ingestion server:
  - `flush(cb)` called straight after `score()` returns in about 1ms with **no
    error and zero HTTP requests sent**. `score()` enqueues through an async
    processing step, so the item is not in the queue yet and `flush` finds it
    empty. Treating that callback as confirmation reports success for a score
    that never left the process.
  - `flushAsync()` awaits that processing and does send, but swallows the
    failure. Its own docstring: "This function always resolves, even if there
    were errors when flushing."

  So this adapter awaits the pending event-processing promises first (what
  `flushAsync` does internally) and only then calls `flush(cb)`. That both
  transmits the score and surfaces a real failure, including a `207` carrying
  per-event errors.

See also: [Langfuse custom scores](https://langfuse.com/docs/scores/custom)
(session-level scores, checked 2026-07-27).
