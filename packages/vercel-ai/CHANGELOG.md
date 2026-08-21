# @uservane/vercel-ai

## 0.1.3

### Patch Changes

- 2cb07af: Add npm keywords so the packages are findable by search.

  All nine shipped with none, which meant npm search, itself a catalogue we were
  already listed in, could not surface them for the terms people actually type:
  langfuse, agent-feedback, vercel-ai-sdk, copilotkit, nps, csat. Keywords are
  metadata only and change no behaviour, but they only take effect on publish.

- Updated dependencies [2cb07af]
  - @uservane/browser@0.1.2
  - @uservane/agent-core@0.1.2
  - @uservane/agent-react@0.1.2

## 0.1.2

### Patch Changes

- Updated dependencies [317a8f1]
  - @uservane/browser@0.1.1
  - @uservane/agent-core@0.1.1
  - @uservane/agent-react@0.1.1

## 0.1.1

### Patch Changes

- d9082b1: Fix: ship `server.d.ts` for the `./server` export. The two-config tsup build had
  a `clean` race that could drop the server entry's declaration file, so the
  `./server` subpath (`mintFeedbackToken`, `mintDeferredAskLink`) published without
  TypeScript types. Clean `dist` once before tsup and disable per-config `clean` so
  both the client and server declarations are always emitted.
