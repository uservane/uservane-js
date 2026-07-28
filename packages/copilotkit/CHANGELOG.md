# @uservane/copilotkit

## 0.1.1

### Patch Changes

- d9082b1: Fix: ship `server.d.ts` for the `./server` export. The two-config tsup build had
  a `clean` race that could drop the server entry's declaration file, so the
  `./server` subpath (`mintFeedbackToken`, `mintDeferredAskLink`) published without
  TypeScript types. Clean `dist` once before tsup and disable per-config `clean` so
  both the client and server declarations are always emitted.
