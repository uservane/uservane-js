# `@uservane/react-native`

React Native SDK for [UserVane](https://uservane.com) honest microsurveys.

Reuses the platform-agnostic core from [`@uservane/browser`](../browser)
(client, show-decision, sampling, scale, types). The renderer is React Native
(`View` / `Text` / `Pressable` / `TextInput`) with accessibility roles and
reduced-motion support. It does not reimplement show-decision or suppression.

## Install

> Preview: not yet published to npm. The package has no `dist/` and cannot be installed via the registry yet; develop from this monorepo workspace.

```bash
pnpm add @uservane/react-native
# peers: react >= 18, react-native >= 0.72
```

## Three lines to install

```tsx
import { UserVaneProvider, useUserVane } from "@uservane/react-native";

export function App() {
  return (
    <UserVaneProvider apiKey="uv_pk_live_...">
      <Home />
    </UserVaneProvider>
  );
}

function Home() {
  const { survey, identify } = useUserVane();
  // after auth:
  identify({ userId: "u_123", traits: { plan: "pro" } });
  survey("nps-q1");
  return null;
}
```

Optional provider props: `apiBase`, `debug`, `userId`, `traits`.

The provider mounts the survey card when a survey is active. You do not need a
separate survey component in the host tree.

## Integrity

- Show-decision consumes the server **suppression set** and **show-token** from
  bootstrap (same as the browser SDK).
- Responses POST with that show-token. There is no forgeable client-only path.
- Answered and dismissed surveys are suppressed for the session; the server is
  authoritative across devices.
- Bootstrap failure is fail-safe: nothing is shown (never a broken widget).

## Accessibility

- Rating scales use `accessibilityRole="radiogroup"` / `"radio"` with
  `accessibilityLabel` and `accessibilityState.selected`.
- Reduced motion is read from `AccessibilityInfo` (instant state changes).
- Dismissal is always one clear action. No dark patterns, no re-prompt after
  answering.

## Errors

An internal error boundary wraps the provider subtree. A render throw inside
anything under the provider is caught and does not reach the host tree.

## Types

Public types from `@uservane/browser` (`InitOptions`, `IdentifyOptions`,
`SurveyDefinition`, and related) are re-exported from this package.
