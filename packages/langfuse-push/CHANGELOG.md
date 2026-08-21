# @uservane/langfuse-push

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
