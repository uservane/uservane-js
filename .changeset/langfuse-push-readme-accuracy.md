---
"@uservane/langfuse-push": patch
---

Correct the README to match what the adapter actually does. It documented
session-level scores only and told callers to use `flushAsync()`. The
implementation also writes observation-level scores when a row carries both
`traceId` and `observationId`, deliberately uses `flush(cb)` because
`flushAsync()` swallows ingestion failures, and relies on the Langfuse SDK's own
retry rather than an outer backoff loop. Also documents the stable score id that
makes a re-push upsert instead of duplicate. Docs only, no runtime change.
