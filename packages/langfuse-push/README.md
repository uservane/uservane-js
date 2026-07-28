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
2. For each row, create a Langfuse **session-level** score via the official
   `langfuse` Node SDK: `name = uservane.satisfaction` (or `scoreName`),
   `value = rating` (0-10 raw), `comment = text`, keyed to `sessionId`.
3. `POST /v1/sdk/pending-scores/ack` with per-id `delivered` | `failed`.
4. Transient Langfuse errors are retried with backoff; permanent failure is
   acked as `failed` and re-pollable later with `includeFailed: true`.

Unlinked rows are never in the queue and never pushed.

## Score create (verified)

Against installed `langfuse@3.38.20` / `langfuse-core` types:

- `Langfuse.score(body: CreateLangfuseScoreBody): this`
- `CreateLangfuseScoreBody` / `ScoreBody` includes optional `sessionId` with no
  required `traceId` (session-only scores are supported).
- Call `flushAsync()` after score creation to drain the SDK ingestion queue.

See also: [Langfuse custom scores](https://langfuse.com/docs/scores/custom)
(session-level scores, checked 2026-07-27).
