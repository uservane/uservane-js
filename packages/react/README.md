# `@uservane/react`

Thin React wrapper over [`@uservane/browser`](../browser). Provides a provider,
hook, and internal error boundary. It does not reimplement the widget or
show-decision logic.

## Install

```bash
pnpm add @uservane/react
# peer: react >= 18
```

## Usage

```tsx
import { UserVaneProvider, useUserVane } from "@uservane/react";

export function App() {
  return (
    <UserVaneProvider apiKey="uv_pk_live_...">
      <Page />
    </UserVaneProvider>
  );
}

function Page() {
  const { survey, identify } = useUserVane();
  // after auth:
  identify({ userId: "u_123", traits: { plan: "pro" } });
  survey("nps-q1");
  return null;
}
```

Optional props: `apiBase`, `debug` (forwarded to `UserVane.init`).

## Next.js App Router

`UserVaneProvider` is a **Client Component**. The package entry is published with
`"use client"`. Import it from a client boundary:

```tsx
// app/providers.tsx
"use client";

import { UserVaneProvider } from "@uservane/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <UserVaneProvider apiKey={process.env.NEXT_PUBLIC_USERVANE_KEY ?? ""}>
      {children}
    </UserVaneProvider>
  );
}
```

Then wrap the app in `app/layout.tsx` with `<Providers>`.

No `window` or `document` access runs at import time. `UserVane.init` runs in a
client-only effect, once per page (guarded against StrictMode double-mount).

## Errors

An internal error boundary wraps the provider subtree. A render throw inside
anything under the provider is caught and does not reach the host tree outside
`UserVaneProvider` (PRODUCT-DESIGN [R2]).

## Types

Public types from `@uservane/browser` (`InitOptions`, `IdentifyOptions`,
`SurveyDefinition`, and related) are re-exported from this package.
