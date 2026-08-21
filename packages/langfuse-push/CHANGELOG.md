# @uservane/langfuse-push

## 0.1.3

### Patch Changes

- 93df525: Fix a delivery-confirmation bug that reported scores as delivered without
  sending them.

  Both packages called the Langfuse SDK's `flush(cb)` immediately after `score()` /
  `trace()` and treated the callback as delivery confirmation. Verified empirically
  against `langfuse@3.38.20` with a local ingestion server: that call returns in
  about 1ms with **no error and zero HTTP requests sent**, because `score()`
  enqueues through an async processing step and `flush` finds the queue empty.

  The effect on `pushPendingScores` was that every score was acked to UserVane as
  `delivered` regardless of outcome, real ingestion failures were never detected
  (so `includeFailed` re-polling never triggered), and the trailing scores of a run
  were lost when a cron process exited.

  Both packages now await the SDK's pending event-processing promises first (what
  `flushAsync` does internally) and only then flush with a callback, which both
  transmits the event and surfaces a genuine failure, including a `207` carrying
  per-event errors.

  Adds an integration test that runs the real SDK against a local HTTP server. The
  existing unit tests injected a fake whose `flush(cb)` called back immediately, so
  they modelled the intended contract rather than the SDK's actual behaviour and
  stayed green throughout.

## 0.1.2

### Patch Changes

- d9b6127: Correct the README to match what the adapter actually does. It documented
  session-level scores only and told callers to use `flushAsync()`. The
  implementation also writes observation-level scores when a row carries both
  `traceId` and `observationId`, deliberately uses `flush(cb)` because
  `flushAsync()` swallows ingestion failures, and relies on the Langfuse SDK's own
  retry rather than an outer backoff loop. Also documents the stable score id that
  makes a re-push upsert instead of duplicate. Docs only, no runtime change.

## 0.1.1

### Patch Changes

- 2cb07af: Add npm keywords so the packages are findable by search.

  All nine shipped with none, which meant npm search, itself a catalogue we were
  already listed in, could not surface them for the terms people actually type:
  langfuse, agent-feedback, vercel-ai-sdk, copilotkit, nps, csat. Keywords are
  metadata only and change no behaviour, but they only take effect on publish.
